# asyncgraph

**asyncgraph** is a very simply module for controlling flow between asynchronous code. The idea is to be able to create complex graphs instead of the very simple parallel or series constructions provided by other async libraries. We find it most useful for initializing things at the beginning of a program.

## Usage

The exported object is the `Graph` constructor. Simply instantiate it, and start registering nodes to it:

#### Example

```javascript
var Graph = require('asyncgraph');

var g = new Graph();

g.register({
    name: 'redis',
    run: function(cb){
        // do some redis init...
        cb();
    }
});

g.register({
    name: 'mongo',
    run: function(cb){
        // do some mongo init...
        cb();
    }
});

g.register({
    name: 'orm',
    run: function(cb){
        // load up some ORM that requires redis and mongo
        cb();
    },
    depends: ['redis', 'mongo']
});

g.on('done', function(){
    // continue with the program
});

g.start();
```

For more detailed information, check out the JSDocs.

## KNOWN ISSUES

Please take care about circular reference.

## LICENSE
see LICENSE file.
