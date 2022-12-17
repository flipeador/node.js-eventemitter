# Node.js EventEmitter

Stores listener functions and emits events.

Similar to [Node.js — Class EventEmitter](https://nodejs.org/api/events.html#class-eventemitter):

- `EventEmitter` allows setting valid event names.
- `EventEmitter#addListener` allows setting the maximum number of times a listening function can be called before it is removed.
- `EventEmitter#emit` returns a list of results, or `null` if the event has no listeners.
  - The second parameter is a list of arguments.
  - The third parameter determines the behavior of listener function exceptions.
  - The `error` event is not emitted.
  - The standard `this` keyword is set to an object `{emitter,results,args}`.
- `EventEmitter#emit2` returns a promise to deal with async listener functions.
- Some repetitive or rarely used methods have not been included, and others have had their behavior slightly changed.

## Installation

```bash
npm install https://github.com/flipeador/node.js-eventemitter
```

## Example

<details>
<summary><h4>Synchronous listener functions</h4></summary>

```js
const { EventEmitter } = require('@flipeador/node.js-eventemitter');

const emitter = new EventEmitter();

emitter.on('message', () => {
    console.log('message #1');
    return 'value #1';
});

emitter.on('message', () => {
    console.log('message #2');
    throw new Error('error #2'); // (1)
});

emitter.on('message', async () => {
    console.log('message #3');
    return 'value #3';
});

// By default, listener functions exceptions are thrown immediately.
// This stops the loop and subsequent listening functions will not be called, if any.
try {
    emitter.emit('message', ['arg1', 'arg2']);
} catch (error) {
    // Note that "message #3" is not displayed.
    console.log('catch:', error.message); // (1)
}

// The above behavior can be changed by setting a callback function.
// Any returned value other than undefined will be added as a result.
console.log('-'.repeat(50));
console.log(emitter.emit('message', [], error => {
    return error; // result
}));
```

```
message #1
message #2
catch: error #2
--------------------------------------------------
message #1
message #2
message #3
[
  'value #1',
  Error: error #2
      ...,
  Promise { 'value #3' }
]
```

</details>

<details>
<summary><h4>Asynchronous listener functions</h4></summary>

```js
const { EventEmitter } = require('@flipeador/node.js-eventemitter');

const emitter = new EventEmitter();

emitter.on('message', () => {
    console.log('message #1');
    return 'value #1';
});

emitter.on('message', async () => {
    console.log('message #2');
    throw new Error('error #2'); // (1)
});

emitter.on('message', async () => {
    console.log('message #3');
    return 'value #3';
});

(async () => {
    // In async functions, exceptions are not thrown immediately.
    // This allows 'message #3' to be displayed on the console.
    try {
        await emitter.emit2('message', ['arg1', 'arg2']);
    } catch (error) {
        console.log('catch:', error.message); // (1)
    }

    // Note that 'value #3' is no longer a promise.
    console.log('-'.repeat(50));
    console.log(await emitter.emit2('message', [], error => {
        return error; // result
    }));
})();
```

```
message #1
message #2
message #3
catch: error #2
--------------------------------------------------
message #1
message #2
message #3
[
  'value #1',
  Error: error #2
      ...,
  'value #3'
]
```

</details>

<details>
<summary><h4>Valid event names and maximum number of listeners</h4></summary>

```js
const { EventEmitter } = require('@flipeador/node.js-eventemitter');

const MAX_LISTENERS = 10; // default

const emitter = new EventEmitter(
    // List of valid event names.
    'message'
).setMaxListeners(MAX_LISTENERS);

try {
    emitter.on('exit', console.log);
} catch (error) {
    console.log('catch:', error);
}

for (let index = MAX_LISTENERS+1; index; --index)
    emitter.on('message', console.log);
```

```
catch: EventEmitterError: Invalid event name: 'exit'
    ...
(node:6360) Error: Possible memory leak detected: 11 listeners added to 'message'
(Use `node --trace-warnings ...` to show where the warning was created)
```

</details>

## License

This project is licensed under the **GNU General Public License v3.0**. See the [license file](LICENSE) for details.
