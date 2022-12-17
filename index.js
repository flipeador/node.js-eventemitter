'use strict';

const util = require('node:util');
const process = require('node:process');

function handleError(results, error, onError, index)
{
    const setval = value => {
        if (index === undefined)
            results.push(value);
        else results[index] = value;
    };
    if (onError === undefined)
        throw error;
    if (onError === false)
        return setval(error);
    if (onError !== null) {
        const retval = onError(error);
        if (retval !== undefined)
            return setval(retval);
    }
    if (index !== undefined)
        results.splice(index, 1); // requires reverse iteration
}

class EventsMap extends Map { }

class EventEmitterError extends Error
{
    constructor(message, ...args)
    {
        super(util.format(message, ...args.map(x => util.inspect(x))));
    }
}

/**
 * Stores listener functions and emits events.
 */
class EventEmitter
{
    _events = new EventsMap();
    _maxListeners = 10;
    _validEvents = [];
    _warnings = [];

    /**
     * Create an EventEmitter object.
     * @param events
     * List of unique event names.
     * Attempting to add, remove or emit an event that is not on this list will throw an error.
     * @remarks
     * - The EventEmitter instance will emit its own `newListener` event before a listener is added.
     * - The EventEmitter instance will emit its own `removeListener` event after a listener is removed.
     */
    constructor(...events)
    {
        if (events.length) {
            this._validEvents.push(
                'newListener',
                'removeListener'
            );
            events.forEach((event, index) => {
                if (this._validEvents.includes(event))
                    throw new EventEmitterError('Event #%s is already on the list: %s', index, event);
                this._validEvents.push(event);
            });
        }
    }

    /**
     * Set the maximum number of listeners that can be added for a particular event.
     * By default a warning is displayed if more than 10 listeners are added for a particular event.
     * @param {Number} count Set to `Infinity` to indicate an unlimited number of listeners.
     */
    setMaxListeners(count)
    {
        if (typeof(count) !== 'number' || count < 1)
            throw new EventEmitterError('Invalid count: %s', count);
        this._maxListeners = count;
        return this;
    }

    /**
     * Add a listener function to the listener array for the specified event.
     * @param event Event name.
     * @param {Function} listener Listener function to be added.
     * @param {Object} options Options.
     * @param {Number} options.count The maximum number of times the listener can be emitted before being removed.
     * @param {Boolean} options.prepend Whether to add the listener to the beginning of the listeners array.
     */
    addListener(event, listener, options)
    {
        const listeners = this.listeners(event);
        (listener instanceof Array ? listener : [listener])
        .forEach((listener, index) => {
            if (typeof(listener) !== 'function')
                throw new EventEmitterError('Invalid function #%s: %s', index, listener);
            this.emit('newListener', [event, listener, options]);
            listeners[options?.prepend?'unshift':'push']({
                callback: listener,
                count: options?.count ?? Infinity
            });
        });
        if (listeners.length > this._maxListeners && !this._warnings.includes(event)) {
            process.emitWarning(
                new EventEmitterError(`Possible memory leak detected: %s listeners added to %s`, listeners.length, event)
            );
            this._warnings.push(event);
        }
        return this;
    }

    /**
     * Remove a listener function from the listener array for the specified event.
     * @param event Event name.
     * @param {Function} listener Listener function to be removed.
     * @remarks Only the most recently added listener will be removed, `removeListener` must be called multiple times to remove duplicated listeners.
     */
    removeListener(event, listener)
    {
        const listeners = this.listeners(event);
        (listener === listeners ? listener.slice() : listener instanceof Array ? listener : [listener])
        .forEach((listener, index) => {
            if (typeof(listener) !== 'function') {
                if (typeof(listener?.callback) !== 'function')
                    throw new EventEmitterError('Invalid function #%s: %s', index, listener);
                listener = listener.callback;
            }
            const pos = listeners.findIndex(x => x.callback === listener);
            if (pos !== -1) {
                listeners.splice(pos, 1);
                this.emit('removeListener', [event, listener]);
            }
        });
        return this;
    }

    /**
     * Removes all listener functions, or those of the specified event name.
     * @return {this}
     */
    removeAllListeners(event)
    {
        if (event !== undefined && event !== null)
            return this.removeListener(event, this.listeners(event));
        this._events.forEach((listeners, event) => {
            if (event !== 'removeListener')
                this.removeListener(event, listeners);
        });
        return this.removeAllListeners('removeListener');
    }

    /**
     * Synchronously calls each of the listeners registered for the specified event, in insertion order.
     * @param event Event name.
     * @param args List of arguments.
     * @param {undefined|null|false|Function} onError
     * Determines the behavior when a listener function throws an exception.
     * - `undefined` — Default. Throw errors.
     * - `null` — Ignore errors.
     * - `false` — Treat errors as results.
     * - `function` — Error handler, the return value is added as a result if it is not `undefined`.
     * @returns {Array?} List of results, or `null` if the event has no listeners.
     */
    emit(event, args, onError)
    {
        const listeners = this.listeners(event);
        if (!(args instanceof Array))
            args = args === undefined ? [] : [args];
        const data = { emitter: this, results: [], args };
        for (const listener of listeners.slice()) {
            if (--listener.count < 1) {
                const index = listeners.indexOf(listener);
                if (index !== -1) listeners.splice(index, 1);
            }
            try {
                data.results.push(listener.callback.call(data, ...args));
            } catch (error) {
                handleError(data.results, error, onError);
            }
        }
        return data.results;
    }

    /**
     * Similar to {@link emit}, but returns a promise to deal with async listener functions.
     * @returns {Promise<Array>?} List of results, or `null` if the event has no listeners.
     */
    emit2(event, args, onError)
    {
        const results = this.emit(event, args, onError);
        if (!results) return results;
        const promises = [];
        for (let index = results.length - 1; index >= 0; --index)
            if (results[index] instanceof Promise)
                promises.push(results[index].then(
                    value => results[index] = value,
                    error => handleError(results, error, onError, index)
                ));
        return Promise.all(promises).then(() => results);
    }

    /**
     * Get or set the events.
     */
    events(events)
    {
        if (events !== undefined) {
            if (!(events instanceof EventsMap))
                throw new EventEmitterError('Invalid events object: %s', events);
            this._events = events;
        }
        return this._events;
    }

    /**
     * Get the array of listeners for the specified event.
     * @return {Array}
     */
    listeners(event)
    {
        if (this._validEvents.length && !this._validEvents.includes(event))
            throw new EventEmitterError('Invalid event name: %s', event);
        let listeners = this._events.get(event);
        if (!listeners)
            this._events.set(event, listeners = []);
        return listeners;
    }

    /**
     * Add a listener function to the listener array for the specified event.
     * @reference {@link EventEmitter.addListener()}
     */
    on(event, listener, options={})
    {
        return this.addListener(event, listener, {...options, count:Infinity});
    }

    /**
     * Add a one-time listener function to the listener array for the specified event.
     * @reference {@link EventEmitter.addListener()}
     */
    once(event, listener, options={})
    {
        return this.addListener(event, listener, {...options, count:1});
    }

    off = this.removeListener;
}

module.exports = {
    EventEmitterError,
    EventEmitter
};
