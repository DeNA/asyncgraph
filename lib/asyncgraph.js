'use strict';

var Promise = require('thrush');
var EventEmitter = require('events').EventEmitter;
require('util').inherits(Graph, EventEmitter);

/**
 * The EventEmitter from node.js
 * @external EventEmitter
 * @see {@link http://nodejs.org/api/events.html#events_class_events_eventemitter EventEmitter}
 */

/**
 * This a way to create a graph of asynchronous execution. Just create an
 * instance of this class, and then register nodes onto it using
 * [register]{@link Graph#register}. Then when you're ready to start it off, just call
 * [start]{@link Graph#start}.
 *
 * @class
 * @extends external:EventEmitter
 */

function Graph () {
    var self = this;
    EventEmitter.call(this);
    this._registeredObjects = [];
    this._conditionalDepends = [];
    this.setMaxListeners(0);
    this._bindArg = {};
    this._initializing = false;
    this.on('_start',function () {
        self._initializing = true;
    });
    this.on('done', function () {
        self._initializing = false;
    });
    this.on('error', function () {
        self._initializing = false;
    });
}

Graph.prototype.listEvents = function() {
    return this._registeredObjects.map(function (o) {
        return o.name;
    });
};

Graph.prototype._onAll = function onAll(arr, func) {
    var notRunYet = [].slice.call(arr);
    var self = this;
    arr.forEach(function(eventName){
        self.on(eventName, function(){
            notRunYet.splice(notRunYet.indexOf(eventName), 1);
            if (!notRunYet.length) {
                func();
            }
        });
    });
};

Graph.prototype._emitSuccess = function(obj) {
    this.emit(obj.name);
    this._registeredObjects.splice(this._registeredObjects.indexOf(obj), 1);

    if (!this._registeredObjects.length) {
        this.emit('done');
    }
};

/**
 * Registers a node in the graph. Nodes must have the following format:
 *
 *     {
 *         name: 'name'
 *         run: function(cb){},
 *         depends: [ ... ],
 *         conditionalDepends: [ ... ]
 *     }
 *
 * The `name` can be any string, but it must be unique in the graph, and cannot
 * be `_start`, `done` or `error`.
 *
 * `depends` establishes a dependency for each event identified as a string in
 * the array. This means that this node's `run` function will not be executed
 * until all the events in the `depends` array have completed **successfully**.
 * `depends` should be omitted if the node has no dependencies.
 *
 * `conditionalDepends` behaves like `depends`, but only solves a dependency if
 * an event list contains the dependency plugin.
 *
 * `run` must be a function that either calls a callback or returns a promise.
 * This is where you do all the async things you want for this node.
 * If the code in `run` has an error, it must either be passed to the callback
 * or as the rejection reason for the returned promise. The {@link Graph#error}
 * event on the graph will then be emitted.
 *
 * @param {Object} obj The node definition.
 * @param {String} obj.name The unique name of the node. Cannot be `_start`, `done` or `error`.
 * @param {Function} obj.run The function to run for this node. Must call a callback or return a promise.
 * @param {String[]} [obj.depends] An array of node names that must run before this node does.
 * @param {String[]} [obj.conditionalDepends] An array of node names that must run before this node does.
 * @param {Object} [bindArg] An optional object to bind to in the `run` function. If omitted, will bind to the graph.
 */
Graph.prototype.register = function(obj, bindArg) {
    this._bindArg[obj.name] = bindArg;
    this._registeredObjects.push(obj);
};

/**
 * It goes through names provided in input array object. It will remove a node registered with that name.
 * Once the graph has started this method has no effect since all modules have been started.
 * @param {String[]} names An array of name of nodes to be removed.
 */
Graph.prototype.deRegister = function (names) {
    if(!Array.isArray(names) || this._initializing){
        return;
    }
    for(var i=0; i < names.length; ++i){
        if(typeof names[i] !== 'string'){
            return;
        }
    }
    var newArray = [];
    this._registeredObjects.reduce(function (chain, value) {
        if(names.indexOf(value.name) < 0){
            chain.push(value);
        }
        return chain;
    },newArray);
    this._registeredObjects = newArray;
};

/**
 * Initiates the async graph.
 *
 * This causes the nodes that have no dependencies to execute their `run`
 * functions, starting off the chain. When all nodes in the graph have executed,
 * the graph will emit a {@link Graph#done} event.
 *
 * @fires Graph#done
 * @fires Graph#error
 */
Graph.prototype.start = function(){
    var self = this;
    var ev_array = self.listEvents();
    if(ev_array.length === 0) {
        this.emit('done');
        return;
    }
    this._registeredObjects.forEach(function(obj) {
        if (obj.conditionalDepends) {
            obj.conditionalDepends.forEach(function(depend) {
                // search depend from registered array
                var pos = ev_array.indexOf(depend);
                // add the found name to depends array
                if (pos >= 0) {
                    if(! obj.depends) {
                        obj.depends = [depend];
                    } else {
                        obj.depends.push(depend);
                    }
                }
            });
        }
        var events = (obj.depends || []).concat(['_start']);
        self._onAll(events, function(){
            Promise.safelyPromisify(obj.run, self._bindArg[obj.name] || obj)().then(function(){
                self._emitSuccess(obj);
            }).catch(function(err){
                self.emit('error', err);
            });
        });
    });
    process.nextTick(function(){
        self.emit('_start');
    });
};

module.exports = Graph;

/**
 * This is emitted when all `run` functions in all nodes have completed
 * successfully. At this point, you're probably ready to go ahead with the rest
 * of your program.
 *
 * @event Graph#done
 */

/**
 * This is emitted when any graph node's `run` function either calls the
 * callback with an error, or returns a rejecting promise.
 *
 * This is a real {@link external:EventEmitter EventEmitter} error event, so the same rules apply if you don't
 * handle it.
 *
 * @event Graph#error
 * @type {Error}
 */

