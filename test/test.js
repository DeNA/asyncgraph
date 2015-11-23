'use strict';

var Graph = require('../');
var Promise = require('thrush');
var assert = require('assert');

var result = [];

function runZalgoFunc(name) {
    return function(cb){
        result.push(name);
        if (this.depends) {
            this.depends.forEach(function(name){
                assert(result.indexOf(name) > -1);
            });
        }
        cb();
    };
}

function runFunc(name) {
    return function(cb){
        var self = this;
        process.nextTick(function(){
            result.push(name);
            if (self.depends) {
                self.depends.forEach(function(name){
                    assert(result.indexOf(name) > -1);
                });
            }
            cb();
        });
    };
}

function runPFunc(name){
    return Promise.method(function(){
        result.push(name);
        if (this.depends) {
            this.depends.forEach(function(name){
                assert(result.indexOf(name) > -1);
            });
        }
    });
}

function runNodeified(name) {
    return function(cb){
        runPFunc(name).call(this).nodeify(cb);
    };
}

var events = [
    {
        name: 'a',
        run: runFunc('a')
    },
    {
        name: 'd',
        run: runFunc('d'),
        depends: ['a', 'b']
    },
    {
        name: 'c',
        run: runZalgoFunc('c'),
        depends: ['a']
    },
    {
        name: 'b',
        run: runFunc('b')
    },
    {
        name: 'e',
        run: runZalgoFunc('e'),
        depends: ['a', 'b', 'c', 'd']
    },
    {
        name: 'f',
        run: runFunc('f'),
        depends: ['a', 'b', 'c', 'd']
    },
    {
        name: 'g',
        run: runPFunc('g'),
        depends: ['c', 'd'],
        conditionalDepends: ['e']
    },
    {
        name: 'h',
        run: runPFunc('h'),
        depends: ['g']
    },
    {
        name: 'i',
        run: runNodeified('i'),
        depends: ['g'],
        conditionalDepends: ['j', 'k']
    },
    {
        name: 'j',
        run: runFunc('j')
    },
    {
        name: 'k',
        run: runFunc('k'),
        conditionalDepends: ['j']
    }
];

describe('asyncgraph', function(){
    var graph;
    beforeEach(function(){
        result = [];
        graph = new Graph();
    });
    it('should run a basic graph with promises, non-promises, nodeified and zalgo functions', function(done){
        events.forEach(function(e){
            graph.register(e, graph);
        });

        graph.on('done', function(){
            assert(result.length, events.length);
            done();
        });

        graph.start();
    });
    it('should update _initializing flag when start method starts and finishes',function (done) {
        events.forEach(function(e){
            graph.register(e, graph);
        });
        graph.on('_start',function () {
            assert(graph._initializing);
        });
        graph.on('done',function () {
            assert(!graph._initializing);
            done();
        });
        graph.start();
    });
    it('should be able to list events in the order they are added', function(){
        events.forEach(function(e){
            graph.register(e);
        });

        var evs = graph.listEvents();
        assert('a,d,c,b,e,f,g,h,i,j,k' === evs.join());
    });

    it('should not modify the original list of events', function(){
        events.forEach(function(e){
            graph.register(e);
        });

        var evs = graph.listEvents();
        evs.push('j');
        assert('a,d,c,b,e,f,g,h,i,j,k' === graph.listEvents().join());
    });

    it('should deal with misbehaving zalgo nodes', function(done){
        events.forEach(function(e){
            graph.register(e);
        });

        graph.register({
            name: 'bad',
            run: function(cb) {
                result.push('bad');
                cb(new Error('bad bad bad'));
            },
            depends: ['c']
        });

        graph.on('error', function(e){
            assert(e.message === 'bad bad bad');
            assert.equal(e.nodeName, 'bad');
            done();
        });

        graph.start();
    });

    it('should deal with misbehaving callback-style nodes', function(done){
        events.forEach(function(e){
            graph.register(e);
        });

        graph.register({
            name: 'bad',
            run: function(cb) {
                result.push('bad');
                process.nextTick(function(){
                    cb(new Error('bad bad bad'));
                });
            },
            depends: ['c']
        });

        graph.on('error', function(e){
            assert.equal(e.nodeName, 'bad');
            assert(e.message === 'bad bad bad');
            done();
        });

        graph.start();
    });

    it('should deal with misbehaving promise-style nodes', function(done){
        events.forEach(function(e){
            graph.register(e);
        });

        graph.register({
            name: 'bad',
            run: function() {
                result.push('bad');
                return Promise.reject(new Error('bad bad bad'));
            },
            depends: ['c']
        });

        graph.on('error', function(e){
            assert(e.message === 'bad bad bad');
            assert.equal(e.nodeName, 'bad');
            done();
        });

        graph.start();
    });

    it('should work on an empty graph', function(done){
        graph.on('done', done);

        graph.start();
    });

    it('should bind runners to arbitrary objects', function(done){
        var dummy = {};
        graph.register({
            name: 'foo',
            run: function(){
                assert.strictEqual(this, dummy);
                done();
            }
        }, dummy);

        graph.start();
    });
    describe('#deregister',function () {
        afterEach(function () {
            graph._initializing = false;
        });
        it('should remove registered event if name found', function () {
            events.forEach(function(e){
                graph.register(e, graph);
            });
            assert.equal(graph.listEvents().length, 11);
            graph.deRegister(['a','b','c']);

            var newEvents = graph.listEvents();
            assert.equal(newEvents.length, 8);
            assert.deepEqual(newEvents, ['d','e','f','g','h','i','j','k']);
        });
        it('should do nothing if input is not array of strings', function () {
            events.forEach(function(e){
                graph.register(e, graph);
            });
            assert.equal(graph.listEvents().length, 11);

            graph.deRegister([{name: 'a'}]);
            assert.equal(graph.listEvents().length, 11);

            graph.deRegister('a');
            assert.equal(graph.listEvents().length, 11);
        });
        it('should not remove event if start is running', function () {
            events.forEach(function(e){
                graph.register(e, graph);
            });
            assert.equal(graph.listEvents().length, 11);
            graph._initializing = true;
            graph.deRegister(['a','b','c']);
            assert.equal(graph.listEvents().length, 11);
        });
    });
});
