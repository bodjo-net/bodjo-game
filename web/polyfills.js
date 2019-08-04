window.EventEmitter = function () {
    this.events = {};
}
EventEmitter.prototype.on = function (event, listener) {
    if (typeof this.events[event] !== 'object')
        this.events[event] = [];
    this.events[event].push(listener);
}
EventEmitter.prototype.removeListener = function (event, listener) {
    let idx;
    if (typeof this.events[event] === 'object') {
        idx = indexOf(this.events[event], listener);
        if (idx >= 0)
            this.events[event].splice(idx, 1);
    }
}
EventEmitter.prototype.emit = function (event) {
    var i, listeners, length, args = Array.prototype.slice.call(arguments, 1);
    if (typeof this.events[event] === 'object') {
        listeners = this.events[event].slice();
        length = listeners.length;
        for (i = 0; i < length; ++i)
            listeners[i].apply(this, args);
    }
}
EventEmitter.prototype.once = function (event, listener) {
    this.on(event, function g () {
        this.removeListener(event, g);
        listener.apply(this, arguments);
    });
}

// cookies (thanks to https://learn.javascript.ru/cookie)
function getCookie(name) {
  let matches = document.cookie.match(new RegExp(
    "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
  ));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}
function setCookie(name, value, options) {
  options = {
    path: '/',
    ...options
  }

  let updatedCookie = encodeURIComponent(name) + "=" + encodeURIComponent(value);

  for (let optionKey in options) {
    updatedCookie += "; " + optionKey;
    let optionValue = options[optionKey];
    if (optionValue !== true)
      updatedCookie += "=" + optionValue;
  }

  document.cookie = updatedCookie;
}