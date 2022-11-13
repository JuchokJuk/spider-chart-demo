
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function get_root_for_style(node) {
        if (!node)
            return document;
        const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
        if (root && root.host) {
            return root;
        }
        return node.ownerDocument;
    }
    function append_empty_stylesheet(node) {
        const style_element = element('style');
        append_stylesheet(get_root_for_style(node), style_element);
        return style_element.sheet;
    }
    function append_stylesheet(node, style) {
        append(node.head || node, style);
        return style.sheet;
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    // we need to store the information for multiple documents because a Svelte application could also contain iframes
    // https://github.com/sveltejs/svelte/issues/3624
    const managed_styles = new Map();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_style_information(doc, node) {
        const info = { stylesheet: append_empty_stylesheet(node), rules: {} };
        managed_styles.set(doc, info);
        return info;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = get_root_for_style(node);
        const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc, node);
        if (!rules[name]) {
            rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            managed_styles.forEach(info => {
                const { ownerNode } = info.stylesheet;
                // there is no ownerNode if it runs on jsdom.
                if (ownerNode)
                    detach(ownerNode);
            });
            managed_styles.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.52.0' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    function cubicInOut(t) {
        return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
    }

    function blur(node, { delay = 0, duration = 400, easing = cubicInOut, amount = 5, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const f = style.filter === 'none' ? '' : style.filter;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `opacity: ${target_opacity - (od * u)}; filter: ${f} blur(${u * amount}px);`
        };
    }

    /* src\Chart.svelte generated by Svelte v3.52.0 */
    const file = "src\\Chart.svelte";

    // (22:4) {#if animatedLevels[0] >= 6}
    function create_if_block_47(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M596.764 136.627C599.604 125.958 593.272 114.953 582.476 112.645C529.085 101.227 472.952 100.742 417.512 112.613C406.719 114.924 400.392 125.928 403.232 136.593V136.593C406.077 147.278 417.045 153.569 427.87 151.317C476.358 141.23 525.396 141.633 572.141 151.349C582.962 153.598 593.92 147.307 596.764 136.627V136.627Z");
    			add_location(path, file, 21, 32, 430);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_47.name,
    		type: "if",
    		source: "(22:4) {#if animatedLevels[0] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (23:4) {#if animatedLevels[0] >= 5}
    function create_if_block_46(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M583.896 184.948C586.453 175.346 580.754 165.439 571.033 163.379C525.034 153.63 476.705 153.219 428.956 163.353C419.24 165.416 413.545 175.32 416.101 184.919V184.919C418.661 194.535 428.531 200.193 438.278 198.189C479.77 189.656 521.713 189.994 561.731 198.217C571.474 200.219 581.336 194.56 583.896 184.948V184.948Z");
    			add_location(path, file, 22, 32, 854);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_46.name,
    		type: "if",
    		source: "(23:4) {#if animatedLevels[0] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (24:4) {#if animatedLevels[0] >= 4}
    function create_if_block_45(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M572.06 229.402C574.332 220.867 569.266 212.06 560.623 210.244C521.353 201.992 480.122 201.647 439.371 210.221C430.731 212.039 425.668 220.845 427.94 229.377V229.377C430.216 237.925 438.989 242.953 447.657 241.19C482.845 234.033 518.402 234.313 552.354 241.214C561.018 242.975 569.785 237.946 572.06 229.402V229.402Z");
    			add_location(path, file, 23, 32, 1276);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_45.name,
    		type: "if",
    		source: "(24:4) {#if animatedLevels[0] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (25:4) {#if animatedLevels[0] >= 3}
    function create_if_block_44(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M561.251 269.991C563.24 262.523 558.807 254.816 551.242 253.238C518.039 246.312 483.199 246.025 448.755 253.219C441.192 254.798 436.762 262.504 438.749 269.97V269.97C440.741 277.45 448.418 281.848 456.005 280.32C485.581 274.363 515.457 274.594 544.005 280.34C551.59 281.866 559.26 277.467 561.251 269.991V269.991Z");
    			add_location(path, file, 24, 32, 1698);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_44.name,
    		type: "if",
    		source: "(25:4) {#if animatedLevels[0] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (26:4) {#if animatedLevels[0] >= 2}
    function create_if_block_43(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M551.471 306.715C553.176 300.314 549.377 293.707 542.891 292.361C515.094 286.593 485.938 286.355 457.106 292.344C450.622 293.691 446.824 300.298 448.529 306.698V306.698C450.236 313.109 456.816 316.878 463.322 315.577C487.979 310.645 512.881 310.834 536.687 315.593C543.19 316.893 549.765 313.123 551.471 306.715V306.715Z");
    			add_location(path, file, 25, 32, 2117);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_43.name,
    		type: "if",
    		source: "(26:4) {#if animatedLevels[0] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (27:4) {#if animatedLevels[0] >= 1}
    function create_if_block_42(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M542.723 339.574C544.143 334.24 540.977 328.734 535.572 327.613C512.518 322.834 488.339 322.637 464.428 327.599C459.025 328.72 455.86 334.225 457.28 339.558V339.558C458.702 344.901 464.186 348.042 469.607 346.959C490.04 342.878 510.674 343.036 530.402 346.973C535.822 348.055 541.301 344.914 542.723 339.574V339.574Z");
    			add_location(path, file, 26, 32, 2543);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(
    					path,
    					blur,
    					{
    						duration: blurDuration,
    						delay: 0,
    						delay: 0
    					},
    					true
    				);

    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(
    				path,
    				blur,
    				{
    					duration: blurDuration,
    					delay: 0,
    					delay: 0
    				},
    				false
    			);

    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_42.name,
    		type: "if",
    		source: "(27:4) {#if animatedLevels[0] >= 1}",
    		ctx
    	});

    	return block;
    }

    // (31:4) {#if animatedLevels[1] >= 6}
    function create_if_block_41(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M695.527 202.459C686.286 196.398 682.986 184.201 688.526 174.638V174.638C694.062 165.085 706.322 161.781 715.589 167.783C761.412 197.462 801.446 236.81 832.252 284.405C838.249 293.671 834.943 305.925 825.394 311.458V311.458C815.827 317.002 803.624 313.694 797.562 304.447C770.409 263.03 735.45 228.642 695.527 202.459Z");
    			add_location(path, file, 30, 32, 2993);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_41.name,
    		type: "if",
    		source: "(31:4) {#if animatedLevels[1] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (32:4) {#if animatedLevels[1] >= 5}
    function create_if_block_40(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M669.747 242.96C661.442 237.487 658.47 226.511 663.457 217.904V217.904C668.439 209.307 679.474 206.332 687.804 211.749C727.223 237.381 761.686 271.263 788.283 312.191C793.696 320.52 790.719 331.551 782.124 336.531V336.531C773.514 341.519 762.534 338.541 757.059 330.232C733.755 294.861 703.857 265.442 669.747 242.96Z");
    			add_location(path, file, 31, 32, 3417);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_40.name,
    		type: "if",
    		source: "(32:4) {#if animatedLevels[1] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (33:4) {#if animatedLevels[1] >= 4}
    function create_if_block_39(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M645.975 279.994C638.603 275.113 635.96 265.358 640.393 257.708V257.708C644.821 250.066 654.63 247.421 662.026 252.248C695.629 274.18 725.027 303.092 747.778 337.968C752.603 345.363 749.956 355.171 742.316 359.597V359.597C734.662 364.032 724.903 361.383 720.02 354.007C700.2 324.066 674.86 299.122 645.975 279.994Z");
    			add_location(path, file, 32, 32, 3840);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_39.name,
    		type: "if",
    		source: "(33:4) {#if animatedLevels[1] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (34:4) {#if animatedLevels[1] >= 3}
    function create_if_block_38(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M624.212 313.563C617.77 309.28 615.456 300.746 619.335 294.052V294.052C623.209 287.366 631.793 285.05 638.258 289.284C666.632 307.864 691.47 332.295 710.74 361.737C714.97 368.201 712.654 376.783 705.969 380.657V380.657C699.273 384.537 690.734 382.219 686.45 375.773C669.749 350.647 648.46 329.686 624.212 313.563Z");
    			add_location(path, file, 33, 32, 4260);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_38.name,
    		type: "if",
    		source: "(34:4) {#if animatedLevels[1] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (35:4) {#if animatedLevels[1] >= 2}
    function create_if_block_37(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M604.458 343.665C598.942 339.986 596.958 332.672 600.282 326.935V326.935C603.603 321.203 610.962 319.217 616.5 322.852C640.233 338.43 661.018 358.877 677.168 383.498C680.801 389.035 678.815 396.391 673.085 399.711V399.711C667.345 403.038 660.026 401.05 656.346 395.53C642.398 374.607 624.657 357.134 604.458 343.665Z");
    			add_location(path, file, 34, 32, 4679);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_37.name,
    		type: "if",
    		source: "(35:4) {#if animatedLevels[1] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (36:4) {#if animatedLevels[1] >= 1}
    function create_if_block_36(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M586.714 370.299C582.117 367.232 580.464 361.137 583.234 356.356V356.356C586.001 351.579 592.134 349.925 596.748 352.955C616.428 365.877 633.663 382.835 647.061 403.25C650.089 407.863 648.434 413.994 643.659 416.76V416.76C638.876 419.532 632.778 417.876 629.71 413.277C618.148 395.943 603.447 381.464 586.714 370.299Z");
    			add_location(path, file, 35, 32, 5101);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_36.name,
    		type: "if",
    		source: "(36:4) {#if animatedLevels[1] >= 1}",
    		ctx
    	});

    	return block;
    }

    // (40:4) {#if animatedLevels[2] >= 6}
    function create_if_block_35(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M863.406 403.232C852.722 406.077 846.432 417.044 848.684 427.869C858.771 476.355 858.367 525.391 848.651 572.135C846.402 582.956 852.693 593.915 863.373 596.759V596.759C874.042 599.6 885.048 593.267 887.357 582.47C898.773 529.081 899.257 472.95 887.386 417.511C885.075 406.719 874.071 400.391 863.406 403.232V403.232Z");
    			add_location(path, file, 39, 32, 5546);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_35.name,
    		type: "if",
    		source: "(40:4) {#if animatedLevels[2] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (41:4) {#if animatedLevels[2] >= 5}
    function create_if_block_34(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M815.082 416.099C805.466 418.659 799.808 428.529 801.813 438.276C810.345 479.767 810.008 521.71 801.784 561.727C799.782 571.47 805.442 581.332 815.053 583.892V583.892C824.655 586.449 834.562 580.75 836.622 571.029C846.371 525.031 846.78 476.703 836.647 428.955C834.585 419.238 824.681 413.543 815.082 416.099V416.099Z");
    			add_location(path, file, 40, 32, 5969);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_34.name,
    		type: "if",
    		source: "(41:4) {#if animatedLevels[2] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (42:4) {#if animatedLevels[2] >= 4}
    function create_if_block_33(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M770.624 427.938C762.077 430.214 757.049 438.988 758.811 447.655C765.968 482.842 765.688 518.398 758.787 552.348C757.026 561.013 762.055 569.779 770.598 572.055V572.055C779.134 574.328 787.941 569.262 789.757 560.618C798.009 521.349 798.354 480.118 789.78 439.369C787.962 430.729 779.156 425.666 770.624 427.938V427.938Z");
    			add_location(path, file, 41, 32, 6392);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_33.name,
    		type: "if",
    		source: "(42:4) {#if animatedLevels[2] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (43:4) {#if animatedLevels[2] >= 3}
    function create_if_block_32(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M730.031 438.747C722.551 440.739 718.153 448.416 719.681 456.003C725.638 485.579 725.408 515.454 719.662 544.001C718.135 551.586 722.534 559.257 730.01 561.247V561.247C737.478 563.236 745.185 558.803 746.763 551.238C753.689 518.036 753.976 483.197 746.782 448.753C745.203 441.19 737.497 436.76 730.031 438.747V438.747Z");
    			add_location(path, file, 42, 32, 6818);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_32.name,
    		type: "if",
    		source: "(43:4) {#if animatedLevels[2] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (44:4) {#if animatedLevels[2] >= 2}
    function create_if_block_31(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M684.407 536.682C683.107 543.185 686.876 549.761 693.285 551.467V551.467C699.687 553.172 706.294 549.372 707.64 542.886C713.407 515.09 713.646 485.934 707.657 457.104C706.31 450.62 699.703 446.822 693.304 448.527V448.527C686.892 450.234 683.123 456.814 684.424 463.32C689.356 487.977 689.165 512.877 684.407 536.682Z");
    			add_location(path, file, 43, 32, 7242);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_31.name,
    		type: "if",
    		source: "(44:4) {#if animatedLevels[2] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (45:4) {#if animatedLevels[2] >= 1}
    function create_if_block_30(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M653.042 469.605C651.959 464.183 655.1 458.7 660.442 457.277V457.277C665.775 455.857 671.281 459.021 672.403 464.425C677.364 488.335 677.167 512.514 672.388 535.568C671.268 540.973 665.762 544.139 660.427 542.719V542.719C655.087 541.297 651.946 535.818 653.028 530.399C656.965 510.671 657.123 490.037 653.042 469.605Z");
    			add_location(path, file, 44, 32, 7664);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_30.name,
    		type: "if",
    		source: "(45:4) {#if animatedLevels[2] >= 1}",
    		ctx
    	});

    	return block;
    }

    // (49:4) {#if animatedLevels[3] >= 6}
    function create_if_block_29(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M832.218 715.585C838.22 706.318 834.916 694.058 825.363 688.523V688.523C815.8 682.982 803.604 686.282 797.542 695.524C771.359 735.447 736.97 770.407 695.552 797.56C686.305 803.622 682.997 815.825 688.541 825.391V825.391C694.074 834.941 706.328 838.247 715.594 832.25C763.19 801.443 802.539 761.409 832.218 715.585Z");
    			add_location(path, file, 48, 32, 8113);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_29.name,
    		type: "if",
    		source: "(49:4) {#if animatedLevels[3] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (50:4) {#if animatedLevels[3] >= 5}
    function create_if_block_28(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M782.099 663.454C773.493 658.467 762.517 661.438 757.043 669.744C734.561 703.855 705.142 733.752 669.769 757.057C661.46 762.532 658.482 773.512 663.47 782.122V782.122C668.45 790.717 679.481 793.693 687.81 788.281C728.738 761.683 762.622 727.219 788.254 687.801C793.671 679.47 790.697 668.436 782.099 663.454V663.454Z");
    			add_location(path, file, 49, 32, 8533);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_28.name,
    		type: "if",
    		source: "(50:4) {#if animatedLevels[3] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (51:4) {#if animatedLevels[3] >= 4}
    function create_if_block_27(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M742.294 640.389C734.644 635.956 724.889 638.599 720.007 645.971C700.879 674.858 675.935 700.198 645.994 720.018C638.618 724.901 635.969 734.66 640.404 742.314V742.314C644.83 749.954 654.637 752.601 662.033 747.777C696.911 725.025 725.822 695.627 747.754 662.024C752.582 654.627 749.936 644.818 742.294 640.389V640.389Z");
    			add_location(path, file, 50, 32, 8955);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_27.name,
    		type: "if",
    		source: "(51:4) {#if animatedLevels[3] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (52:4) {#if animatedLevels[3] >= 3}
    function create_if_block_26(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M624.228 686.448C617.782 690.732 615.464 699.271 619.345 705.967V705.967C623.218 712.652 631.8 714.968 638.264 710.738C667.706 691.468 692.138 666.63 710.719 638.255C714.953 631.79 712.637 623.205 705.95 619.331V619.331C699.256 615.452 690.722 617.766 686.438 624.208C670.315 648.457 649.353 669.746 624.228 686.448Z");
    			add_location(path, file, 51, 32, 9380);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_26.name,
    		type: "if",
    		source: "(52:4) {#if animatedLevels[3] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (53:4) {#if animatedLevels[3] >= 2}
    function create_if_block_25(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M604.471 656.342C598.951 660.022 596.963 667.341 600.29 673.081V673.081C603.61 678.812 610.967 680.798 616.505 677.165C641.126 661.014 661.574 640.229 677.15 616.496C680.785 610.958 678.799 603.599 673.068 600.278V600.278C667.33 596.953 660.015 598.937 656.335 604.454C642.866 624.652 625.393 642.394 604.471 656.342Z");
    			add_location(path, file, 52, 32, 9802);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_25.name,
    		type: "if",
    		source: "(53:4) {#if animatedLevels[3] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (54:4) {#if animatedLevels[3] >= 1}
    function create_if_block_24(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M629.702 586.71C632.769 582.113 638.864 580.46 643.645 583.23V583.23C648.422 585.997 650.077 592.13 647.047 596.744C634.124 616.424 617.167 633.661 596.751 647.059C592.138 650.087 586.007 648.432 583.241 643.657V643.657C580.469 638.874 582.125 632.776 586.724 629.708C604.058 618.145 618.537 603.444 629.702 586.71Z");
    			add_location(path, file, 53, 32, 10225);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_24.name,
    		type: "if",
    		source: "(54:4) {#if animatedLevels[3] >= 1}",
    		ctx
    	});

    	return block;
    }

    // (58:4) {#if animatedLevels[4] >= 6}
    function create_if_block_23(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M582.49 887.384C593.282 885.073 599.61 874.069 596.769 863.404V863.404C593.924 852.72 582.957 846.43 572.132 848.682C523.646 858.768 474.61 858.365 427.866 848.65C417.045 846.401 406.087 852.693 403.243 863.373V863.373C400.403 874.041 406.735 885.046 417.532 887.355C470.92 898.772 527.052 899.256 582.49 887.384Z");
    			add_location(path, file, 57, 32, 10668);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_23.name,
    		type: "if",
    		source: "(58:4) {#if animatedLevels[4] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (59:4) {#if animatedLevels[4] >= 5}
    function create_if_block_22(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M571.046 836.645C580.763 834.583 586.458 824.679 583.902 815.08V815.08C581.342 805.464 571.472 799.806 561.725 801.81C520.235 810.343 478.292 810.006 438.276 801.783C428.533 799.781 418.67 805.44 416.111 815.052V815.052C413.554 824.654 419.253 834.56 428.974 836.62C474.972 846.369 523.298 846.778 571.046 836.645Z");
    			add_location(path, file, 58, 32, 11087);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_22.name,
    		type: "if",
    		source: "(59:4) {#if animatedLevels[4] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (60:4) {#if animatedLevels[4] >= 4}
    function create_if_block_21(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M447.653 758.785C438.989 757.024 430.222 762.053 427.947 770.597V770.597C425.675 779.132 430.741 787.939 439.384 789.756C478.653 798.008 519.883 798.352 560.631 789.778C569.272 787.96 574.335 779.154 572.063 770.621V770.621C569.787 762.073 561.013 757.045 552.345 758.808C517.159 765.964 481.603 765.684 447.653 758.785Z");
    			add_location(path, file, 59, 32, 11507);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_21.name,
    		type: "if",
    		source: "(60:4) {#if animatedLevels[4] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (61:4) {#if animatedLevels[4] >= 3}
    function create_if_block_20(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M456.001 719.659C448.417 718.133 440.746 722.532 438.756 730.008V730.008C436.767 737.476 441.2 745.183 448.766 746.761C481.968 753.686 516.807 753.974 551.25 746.781C558.813 745.201 563.243 737.495 561.256 730.029V730.029C559.264 722.55 551.587 718.151 543.999 719.679C514.424 725.636 484.548 725.404 456.001 719.659Z");
    			add_location(path, file, 60, 32, 11933);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_20.name,
    		type: "if",
    		source: "(61:4) {#if animatedLevels[4] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (62:4) {#if animatedLevels[4] >= 2}
    function create_if_block_19(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M463.319 684.406C456.817 683.106 450.242 686.876 448.536 693.284V693.284C446.831 699.685 450.631 706.292 457.117 707.638C484.913 713.405 514.069 713.643 542.899 707.653C549.382 706.306 553.179 699.7 551.476 693.301V693.301C549.769 686.891 543.189 683.121 536.684 684.422C512.026 689.354 487.125 689.164 463.319 684.406Z");
    			add_location(path, file, 61, 32, 12356);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_19.name,
    		type: "if",
    		source: "(62:4) {#if animatedLevels[4] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (63:4) {#if animatedLevels[4] >= 1}
    function create_if_block_18(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M530.399 653.04C535.82 651.957 541.303 655.098 542.725 660.44V660.44C544.145 665.772 540.981 671.277 535.578 672.398C511.668 677.36 487.489 677.163 464.436 672.386C459.03 671.266 455.864 665.76 457.284 660.425V660.425C458.706 655.085 464.185 651.944 469.604 653.026C489.332 656.964 509.966 657.121 530.399 653.04Z");
    			add_location(path, file, 62, 32, 12781);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_18.name,
    		type: "if",
    		source: "(63:4) {#if animatedLevels[4] >= 1}",
    		ctx
    	});

    	return block;
    }

    // (66:4) {#if animatedLevels[5] >= 6}
    function create_if_block_17(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M284.418 832.219C293.685 838.22 305.945 834.916 311.48 825.363V825.363C317.021 815.801 313.721 803.604 304.479 797.543C264.554 771.359 229.594 736.97 202.441 695.551C196.379 686.305 184.176 682.997 174.609 688.54V688.54C165.059 694.073 161.753 706.329 167.75 715.595C198.558 763.19 238.593 802.54 284.418 832.219Z");
    			add_location(path, file, 65, 32, 13220);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_17.name,
    		type: "if",
    		source: "(66:4) {#if animatedLevels[5] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (67:4) {#if animatedLevels[5] >= 5}
    function create_if_block_16(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M312.202 788.253C320.532 793.67 331.567 790.695 336.549 782.098V782.098C341.536 773.491 338.564 762.515 330.259 757.041C296.147 734.559 266.249 705.14 242.944 669.767C237.469 661.458 226.489 658.48 217.879 663.468V663.468C209.284 668.448 206.308 679.479 211.72 687.808C238.319 728.736 272.782 762.62 312.202 788.253Z");
    			add_location(path, file, 66, 32, 13639);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_16.name,
    		type: "if",
    		source: "(67:4) {#if animatedLevels[5] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (68:4) {#if animatedLevels[5] >= 4}
    function create_if_block_15(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M279.984 645.993C275.101 638.616 265.341 635.968 257.687 640.403V640.403C250.048 644.83 247.401 654.637 252.225 662.032C274.977 696.91 304.376 725.821 337.979 747.753C345.376 752.58 355.185 749.935 359.614 742.292V742.292C364.047 734.642 361.404 724.887 354.032 720.005C325.145 700.877 299.805 675.934 279.984 645.993Z");
    			add_location(path, file, 67, 32, 14061);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_15.name,
    		type: "if",
    		source: "(68:4) {#if animatedLevels[5] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (69:4) {#if animatedLevels[5] >= 3}
    function create_if_block_14(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M313.553 624.226C309.269 617.78 300.73 615.462 294.034 619.343V619.343C287.349 623.216 285.033 631.798 289.263 638.262C308.533 667.704 333.373 692.136 361.748 710.717C368.213 714.951 376.798 712.635 380.672 705.948V705.948C384.551 699.254 382.237 690.72 375.794 686.436C351.545 670.313 330.255 649.352 313.553 624.226Z");
    			add_location(path, file, 68, 32, 14485);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_14.name,
    		type: "if",
    		source: "(69:4) {#if animatedLevels[5] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (70:4) {#if animatedLevels[5] >= 2}
    function create_if_block_13(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M343.658 604.47C339.978 598.95 332.66 596.963 326.92 600.288V600.288C321.19 603.608 319.203 610.965 322.836 616.503C338.988 641.124 359.773 661.572 383.507 677.148C389.045 680.783 396.404 678.797 399.725 673.065V673.065C403.049 667.328 401.065 660.013 395.548 656.334C375.349 642.865 357.606 625.393 343.658 604.47Z");
    			add_location(path, file, 69, 32, 14909);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_13.name,
    		type: "if",
    		source: "(70:4) {#if animatedLevels[5] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (71:4) {#if animatedLevels[5] >= 1}
    function create_if_block_12(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M413.291 629.7C417.889 632.767 419.542 638.863 416.772 643.645V643.645C414.004 648.422 407.871 650.077 403.256 647.046C383.576 634.123 366.341 617.165 352.942 596.749C349.914 592.136 351.569 586.005 356.344 583.239V583.239C361.127 580.467 367.225 582.123 370.293 586.723C381.855 604.056 396.557 618.535 413.291 629.7Z");
    			add_location(path, file, 70, 32, 15330);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_12.name,
    		type: "if",
    		source: "(71:4) {#if animatedLevels[5] >= 1}",
    		ctx
    	});

    	return block;
    }

    // (74:4) {#if animatedLevels[6] >= 6}
    function create_if_block_11(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M112.615 582.489C114.926 593.282 125.93 599.609 136.595 596.769V596.769C147.28 593.924 153.571 582.956 151.318 572.131C141.231 523.645 141.634 474.607 151.35 427.863C153.599 417.042 147.309 406.084 136.629 403.24V403.24C125.96 400.399 114.955 406.732 112.646 417.528C101.229 470.917 100.744 527.05 112.615 582.489Z");
    			add_location(path, file, 73, 32, 15773);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_11.name,
    		type: "if",
    		source: "(74:4) {#if animatedLevels[6] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (75:4) {#if animatedLevels[6] >= 5}
    function create_if_block_10(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M163.356 571.044C165.418 580.761 175.322 586.456 184.921 583.9V583.9C194.537 581.34 200.195 571.47 198.19 561.723C189.658 520.232 189.995 478.289 198.219 438.272C200.221 428.529 194.561 418.667 184.95 416.107V416.107C175.348 413.55 165.441 419.249 163.381 428.97C153.632 474.968 153.223 523.296 163.356 571.044Z");
    			add_location(path, file, 74, 32, 16193);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_10.name,
    		type: "if",
    		source: "(75:4) {#if animatedLevels[6] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (76:4) {#if animatedLevels[6] >= 4}
    function create_if_block_9(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M229.405 427.944C220.869 425.671 212.062 430.737 210.246 439.381C201.994 478.65 201.649 519.882 210.222 560.631C212.041 569.272 220.847 574.334 229.38 572.062V572.062C237.927 569.785 242.955 561.012 241.192 552.344C234.035 517.157 234.315 481.601 241.216 447.651C242.977 438.986 237.948 430.22 229.405 427.944V427.944Z");
    			add_location(path, file, 75, 32, 16610);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_9.name,
    		type: "if",
    		source: "(76:4) {#if animatedLevels[6] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (77:4) {#if animatedLevels[6] >= 3}
    function create_if_block_8(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M280.342 455.998C281.868 448.413 277.469 440.743 269.993 438.752V438.752C262.525 436.763 254.818 441.196 253.24 448.762C246.314 481.963 246.027 516.804 253.22 551.248C254.8 558.811 262.506 563.241 269.972 561.254V561.254C277.451 559.262 281.85 551.585 280.322 543.998C274.365 514.422 274.597 484.546 280.342 455.998Z");
    			add_location(path, file, 76, 32, 17034);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_8.name,
    		type: "if",
    		source: "(77:4) {#if animatedLevels[6] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (78:4) {#if animatedLevels[6] >= 2}
    function create_if_block_7(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M315.595 463.316C316.895 456.813 313.125 450.238 306.717 448.531V448.531C300.316 446.827 293.709 450.626 292.363 457.112C286.595 484.909 286.356 514.065 292.346 542.896C293.693 549.38 300.299 553.177 306.698 551.474V551.474C313.11 549.767 316.879 543.186 315.578 536.68C310.646 512.023 310.836 487.121 315.595 463.316Z");
    			add_location(path, file, 77, 32, 17456);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_7.name,
    		type: "if",
    		source: "(78:4) {#if animatedLevels[6] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (79:4) {#if animatedLevels[6] >= 1}
    function create_if_block_6(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M346.961 530.397C348.044 535.818 344.903 541.301 339.561 542.723V542.723C334.229 544.143 328.724 540.979 327.603 535.576C322.64 511.666 322.836 487.486 327.615 464.432C328.735 459.027 334.241 455.861 339.575 457.281V457.281C344.915 458.703 348.057 464.182 346.975 469.601C343.037 489.33 342.88 509.964 346.961 530.397Z");
    			add_location(path, file, 78, 32, 17880);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6.name,
    		type: "if",
    		source: "(79:4) {#if animatedLevels[6] >= 1}",
    		ctx
    	});

    	return block;
    }

    // (82:4) {#if animatedLevels[7] >= 6}
    function create_if_block_5(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M167.785 284.414C161.783 293.681 165.087 305.941 174.64 311.476V311.476C184.203 317.017 196.399 313.717 202.461 304.475C228.644 264.552 263.032 229.592 304.449 202.439C313.696 196.377 317.004 184.174 311.46 174.607V174.607C305.927 165.058 293.673 161.752 284.407 167.749C236.812 198.555 197.463 238.589 167.785 284.414Z");
    			add_location(path, file, 81, 32, 18324);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 500 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(82:4) {#if animatedLevels[7] >= 6}",
    		ctx
    	});

    	return block;
    }

    // (83:4) {#if animatedLevels[7] >= 5}
    function create_if_block_4(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M336.532 217.876C331.551 209.282 320.52 206.305 312.191 211.718C271.263 238.316 237.381 272.779 211.748 312.198C206.332 320.529 209.306 331.563 217.904 336.545V336.545C226.51 341.532 237.486 338.561 242.96 330.255C265.442 296.144 294.862 266.247 330.233 242.942C338.543 237.467 341.521 226.486 336.532 217.876V217.876Z");
    			add_location(path, file, 82, 32, 18749);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 400 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(83:4) {#if animatedLevels[7] >= 5}",
    		ctx
    	});

    	return block;
    }

    // (84:4) {#if animatedLevels[7] >= 4}
    function create_if_block_3(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M359.598 257.685C355.171 250.045 345.364 247.399 337.969 252.223C303.091 274.974 274.181 304.372 252.249 337.975C247.421 345.372 250.067 355.182 257.709 359.61V359.61C265.359 364.043 275.114 361.4 279.996 354.028C299.124 325.142 324.067 299.802 354.008 279.982C361.384 275.099 364.033 265.339 359.598 257.685V257.685Z");
    			add_location(path, file, 83, 32, 19173);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 300 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(84:4) {#if animatedLevels[7] >= 4}",
    		ctx
    	});

    	return block;
    }

    // (85:4) {#if animatedLevels[7] >= 3}
    function create_if_block_2(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M380.658 294.032C376.785 287.347 368.203 285.031 361.739 289.261C332.297 308.531 307.865 333.369 289.284 361.744C285.05 368.209 287.366 376.794 294.053 380.668V380.668C300.747 384.547 309.281 382.233 313.565 375.791C329.688 351.541 350.649 330.252 375.775 313.551C382.221 309.267 384.539 300.728 380.658 294.032V294.032Z");
    			add_location(path, file, 84, 32, 19596);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 200 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(85:4) {#if animatedLevels[7] >= 3}",
    		ctx
    	});

    	return block;
    }

    // (86:4) {#if animatedLevels[7] >= 2}
    function create_if_block_1(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M395.532 343.655C401.052 339.975 403.04 332.656 399.713 326.916V326.916C396.393 321.186 389.037 319.201 383.5 322.833C358.879 338.985 338.431 359.769 322.854 383.503C319.219 389.041 321.204 396.4 326.936 399.721V399.721C332.674 403.045 339.988 401.061 343.667 395.544C357.136 375.346 374.608 357.603 395.532 343.655Z");
    			add_location(path, file, 85, 32, 20022);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 100 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(86:4) {#if animatedLevels[7] >= 2}",
    		ctx
    	});

    	return block;
    }

    // (87:4) {#if animatedLevels[7] >= 1}
    function create_if_block(ctx) {
    	let path;
    	let path_transition;
    	let current;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M370.301 413.288C367.234 417.885 361.138 419.538 356.357 416.768V416.768C351.581 414 349.926 407.868 352.956 403.253C365.879 383.573 382.836 366.336 403.251 352.938C407.865 349.91 413.996 351.566 416.763 356.341V356.341C419.534 361.125 417.877 367.223 413.278 370.291C395.944 381.853 381.466 396.554 370.301 413.288Z");
    			add_location(path, file, 86, 32, 20444);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, true);
    				path_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!path_transition) path_transition = create_bidirectional_transition(path, blur, { duration: blurDuration, delay: 0 }, false);
    			path_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			if (detaching && path_transition) path_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(87:4) {#if animatedLevels[7] >= 1}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let svg0;
    	let if_block0_anchor;
    	let if_block1_anchor;
    	let if_block2_anchor;
    	let if_block3_anchor;
    	let if_block4_anchor;
    	let if_block5_anchor;
    	let if_block6_anchor;
    	let if_block7_anchor;
    	let if_block8_anchor;
    	let if_block9_anchor;
    	let if_block10_anchor;
    	let if_block11_anchor;
    	let if_block12_anchor;
    	let if_block13_anchor;
    	let if_block14_anchor;
    	let if_block15_anchor;
    	let if_block16_anchor;
    	let if_block17_anchor;
    	let if_block18_anchor;
    	let if_block19_anchor;
    	let if_block20_anchor;
    	let if_block21_anchor;
    	let if_block22_anchor;
    	let if_block23_anchor;
    	let if_block24_anchor;
    	let if_block25_anchor;
    	let if_block26_anchor;
    	let if_block27_anchor;
    	let if_block28_anchor;
    	let if_block29_anchor;
    	let if_block30_anchor;
    	let if_block31_anchor;
    	let if_block32_anchor;
    	let if_block33_anchor;
    	let if_block34_anchor;
    	let if_block35_anchor;
    	let if_block36_anchor;
    	let if_block37_anchor;
    	let if_block38_anchor;
    	let if_block39_anchor;
    	let if_block40_anchor;
    	let if_block41_anchor;
    	let if_block42_anchor;
    	let if_block43_anchor;
    	let if_block44_anchor;
    	let if_block45_anchor;
    	let if_block46_anchor;
    	let defs;
    	let linearGradient;
    	let stop0;
    	let stop1;
    	let t;
    	let svg1;
    	let path0;
    	let path1;
    	let path2;
    	let path3;
    	let path4;
    	let path5;
    	let path6;
    	let path7;
    	let path8;
    	let path9;
    	let path10;
    	let path11;
    	let path12;
    	let path13;
    	let path14;
    	let path15;
    	let path16;
    	let path17;
    	let path18;
    	let path19;
    	let path20;
    	let path21;
    	let path22;
    	let path23;
    	let path24;
    	let path25;
    	let path26;
    	let path27;
    	let path28;
    	let path29;
    	let path30;
    	let path31;
    	let path32;
    	let path33;
    	let path34;
    	let path35;
    	let path36;
    	let path37;
    	let path38;
    	let path39;
    	let path40;
    	let path41;
    	let path42;
    	let path43;
    	let path44;
    	let path45;
    	let path46;
    	let path47;
    	let current;
    	let if_block0 = /*animatedLevels*/ ctx[0][0] >= 6 && create_if_block_47(ctx);
    	let if_block1 = /*animatedLevels*/ ctx[0][0] >= 5 && create_if_block_46(ctx);
    	let if_block2 = /*animatedLevels*/ ctx[0][0] >= 4 && create_if_block_45(ctx);
    	let if_block3 = /*animatedLevels*/ ctx[0][0] >= 3 && create_if_block_44(ctx);
    	let if_block4 = /*animatedLevels*/ ctx[0][0] >= 2 && create_if_block_43(ctx);
    	let if_block5 = /*animatedLevels*/ ctx[0][0] >= 1 && create_if_block_42(ctx);
    	let if_block6 = /*animatedLevels*/ ctx[0][1] >= 6 && create_if_block_41(ctx);
    	let if_block7 = /*animatedLevels*/ ctx[0][1] >= 5 && create_if_block_40(ctx);
    	let if_block8 = /*animatedLevels*/ ctx[0][1] >= 4 && create_if_block_39(ctx);
    	let if_block9 = /*animatedLevels*/ ctx[0][1] >= 3 && create_if_block_38(ctx);
    	let if_block10 = /*animatedLevels*/ ctx[0][1] >= 2 && create_if_block_37(ctx);
    	let if_block11 = /*animatedLevels*/ ctx[0][1] >= 1 && create_if_block_36(ctx);
    	let if_block12 = /*animatedLevels*/ ctx[0][2] >= 6 && create_if_block_35(ctx);
    	let if_block13 = /*animatedLevels*/ ctx[0][2] >= 5 && create_if_block_34(ctx);
    	let if_block14 = /*animatedLevels*/ ctx[0][2] >= 4 && create_if_block_33(ctx);
    	let if_block15 = /*animatedLevels*/ ctx[0][2] >= 3 && create_if_block_32(ctx);
    	let if_block16 = /*animatedLevels*/ ctx[0][2] >= 2 && create_if_block_31(ctx);
    	let if_block17 = /*animatedLevels*/ ctx[0][2] >= 1 && create_if_block_30(ctx);
    	let if_block18 = /*animatedLevels*/ ctx[0][3] >= 6 && create_if_block_29(ctx);
    	let if_block19 = /*animatedLevels*/ ctx[0][3] >= 5 && create_if_block_28(ctx);
    	let if_block20 = /*animatedLevels*/ ctx[0][3] >= 4 && create_if_block_27(ctx);
    	let if_block21 = /*animatedLevels*/ ctx[0][3] >= 3 && create_if_block_26(ctx);
    	let if_block22 = /*animatedLevels*/ ctx[0][3] >= 2 && create_if_block_25(ctx);
    	let if_block23 = /*animatedLevels*/ ctx[0][3] >= 1 && create_if_block_24(ctx);
    	let if_block24 = /*animatedLevels*/ ctx[0][4] >= 6 && create_if_block_23(ctx);
    	let if_block25 = /*animatedLevels*/ ctx[0][4] >= 5 && create_if_block_22(ctx);
    	let if_block26 = /*animatedLevels*/ ctx[0][4] >= 4 && create_if_block_21(ctx);
    	let if_block27 = /*animatedLevels*/ ctx[0][4] >= 3 && create_if_block_20(ctx);
    	let if_block28 = /*animatedLevels*/ ctx[0][4] >= 2 && create_if_block_19(ctx);
    	let if_block29 = /*animatedLevels*/ ctx[0][4] >= 1 && create_if_block_18(ctx);
    	let if_block30 = /*animatedLevels*/ ctx[0][5] >= 6 && create_if_block_17(ctx);
    	let if_block31 = /*animatedLevels*/ ctx[0][5] >= 5 && create_if_block_16(ctx);
    	let if_block32 = /*animatedLevels*/ ctx[0][5] >= 4 && create_if_block_15(ctx);
    	let if_block33 = /*animatedLevels*/ ctx[0][5] >= 3 && create_if_block_14(ctx);
    	let if_block34 = /*animatedLevels*/ ctx[0][5] >= 2 && create_if_block_13(ctx);
    	let if_block35 = /*animatedLevels*/ ctx[0][5] >= 1 && create_if_block_12(ctx);
    	let if_block36 = /*animatedLevels*/ ctx[0][6] >= 6 && create_if_block_11(ctx);
    	let if_block37 = /*animatedLevels*/ ctx[0][6] >= 5 && create_if_block_10(ctx);
    	let if_block38 = /*animatedLevels*/ ctx[0][6] >= 4 && create_if_block_9(ctx);
    	let if_block39 = /*animatedLevels*/ ctx[0][6] >= 3 && create_if_block_8(ctx);
    	let if_block40 = /*animatedLevels*/ ctx[0][6] >= 2 && create_if_block_7(ctx);
    	let if_block41 = /*animatedLevels*/ ctx[0][6] >= 1 && create_if_block_6(ctx);
    	let if_block42 = /*animatedLevels*/ ctx[0][7] >= 6 && create_if_block_5(ctx);
    	let if_block43 = /*animatedLevels*/ ctx[0][7] >= 5 && create_if_block_4(ctx);
    	let if_block44 = /*animatedLevels*/ ctx[0][7] >= 4 && create_if_block_3(ctx);
    	let if_block45 = /*animatedLevels*/ ctx[0][7] >= 3 && create_if_block_2(ctx);
    	let if_block46 = /*animatedLevels*/ ctx[0][7] >= 2 && create_if_block_1(ctx);
    	let if_block47 = /*animatedLevels*/ ctx[0][7] >= 1 && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg0 = svg_element("svg");
    			if (if_block0) if_block0.c();
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    			if (if_block3) if_block3.c();
    			if_block3_anchor = empty();
    			if (if_block4) if_block4.c();
    			if_block4_anchor = empty();
    			if (if_block5) if_block5.c();
    			if_block5_anchor = empty();
    			if (if_block6) if_block6.c();
    			if_block6_anchor = empty();
    			if (if_block7) if_block7.c();
    			if_block7_anchor = empty();
    			if (if_block8) if_block8.c();
    			if_block8_anchor = empty();
    			if (if_block9) if_block9.c();
    			if_block9_anchor = empty();
    			if (if_block10) if_block10.c();
    			if_block10_anchor = empty();
    			if (if_block11) if_block11.c();
    			if_block11_anchor = empty();
    			if (if_block12) if_block12.c();
    			if_block12_anchor = empty();
    			if (if_block13) if_block13.c();
    			if_block13_anchor = empty();
    			if (if_block14) if_block14.c();
    			if_block14_anchor = empty();
    			if (if_block15) if_block15.c();
    			if_block15_anchor = empty();
    			if (if_block16) if_block16.c();
    			if_block16_anchor = empty();
    			if (if_block17) if_block17.c();
    			if_block17_anchor = empty();
    			if (if_block18) if_block18.c();
    			if_block18_anchor = empty();
    			if (if_block19) if_block19.c();
    			if_block19_anchor = empty();
    			if (if_block20) if_block20.c();
    			if_block20_anchor = empty();
    			if (if_block21) if_block21.c();
    			if_block21_anchor = empty();
    			if (if_block22) if_block22.c();
    			if_block22_anchor = empty();
    			if (if_block23) if_block23.c();
    			if_block23_anchor = empty();
    			if (if_block24) if_block24.c();
    			if_block24_anchor = empty();
    			if (if_block25) if_block25.c();
    			if_block25_anchor = empty();
    			if (if_block26) if_block26.c();
    			if_block26_anchor = empty();
    			if (if_block27) if_block27.c();
    			if_block27_anchor = empty();
    			if (if_block28) if_block28.c();
    			if_block28_anchor = empty();
    			if (if_block29) if_block29.c();
    			if_block29_anchor = empty();
    			if (if_block30) if_block30.c();
    			if_block30_anchor = empty();
    			if (if_block31) if_block31.c();
    			if_block31_anchor = empty();
    			if (if_block32) if_block32.c();
    			if_block32_anchor = empty();
    			if (if_block33) if_block33.c();
    			if_block33_anchor = empty();
    			if (if_block34) if_block34.c();
    			if_block34_anchor = empty();
    			if (if_block35) if_block35.c();
    			if_block35_anchor = empty();
    			if (if_block36) if_block36.c();
    			if_block36_anchor = empty();
    			if (if_block37) if_block37.c();
    			if_block37_anchor = empty();
    			if (if_block38) if_block38.c();
    			if_block38_anchor = empty();
    			if (if_block39) if_block39.c();
    			if_block39_anchor = empty();
    			if (if_block40) if_block40.c();
    			if_block40_anchor = empty();
    			if (if_block41) if_block41.c();
    			if_block41_anchor = empty();
    			if (if_block42) if_block42.c();
    			if_block42_anchor = empty();
    			if (if_block43) if_block43.c();
    			if_block43_anchor = empty();
    			if (if_block44) if_block44.c();
    			if_block44_anchor = empty();
    			if (if_block45) if_block45.c();
    			if_block45_anchor = empty();
    			if (if_block46) if_block46.c();
    			if_block46_anchor = empty();
    			if (if_block47) if_block47.c();
    			defs = svg_element("defs");
    			linearGradient = svg_element("linearGradient");
    			stop0 = svg_element("stop");
    			stop1 = svg_element("stop");
    			t = space();
    			svg1 = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			path4 = svg_element("path");
    			path5 = svg_element("path");
    			path6 = svg_element("path");
    			path7 = svg_element("path");
    			path8 = svg_element("path");
    			path9 = svg_element("path");
    			path10 = svg_element("path");
    			path11 = svg_element("path");
    			path12 = svg_element("path");
    			path13 = svg_element("path");
    			path14 = svg_element("path");
    			path15 = svg_element("path");
    			path16 = svg_element("path");
    			path17 = svg_element("path");
    			path18 = svg_element("path");
    			path19 = svg_element("path");
    			path20 = svg_element("path");
    			path21 = svg_element("path");
    			path22 = svg_element("path");
    			path23 = svg_element("path");
    			path24 = svg_element("path");
    			path25 = svg_element("path");
    			path26 = svg_element("path");
    			path27 = svg_element("path");
    			path28 = svg_element("path");
    			path29 = svg_element("path");
    			path30 = svg_element("path");
    			path31 = svg_element("path");
    			path32 = svg_element("path");
    			path33 = svg_element("path");
    			path34 = svg_element("path");
    			path35 = svg_element("path");
    			path36 = svg_element("path");
    			path37 = svg_element("path");
    			path38 = svg_element("path");
    			path39 = svg_element("path");
    			path40 = svg_element("path");
    			path41 = svg_element("path");
    			path42 = svg_element("path");
    			path43 = svg_element("path");
    			path44 = svg_element("path");
    			path45 = svg_element("path");
    			path46 = svg_element("path");
    			path47 = svg_element("path");
    			attr_dev(stop0, "offset", "0%");
    			attr_dev(stop0, "stop-color", "#AEE97C");
    			add_location(stop0, file, 90, 8, 20896);
    			attr_dev(stop1, "offset", "100%");
    			attr_dev(stop1, "stop-color", "#5ABA79");
    			add_location(stop1, file, 91, 8, 20947);
    			attr_dev(linearGradient, "id", "gradient");
    			add_location(linearGradient, file, 89, 6, 20856);
    			add_location(defs, file, 88, 4, 20842);
    			attr_dev(svg0, "class", "glow svelte-vlo288");
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg0, "viewBox", "0 0 1000 1000");
    			attr_dev(svg0, "fill", "none");
    			add_location(svg0, file, 17, 2, 287);
    			attr_dev(path0, "d", "M596.764 136.627C599.604 125.958 593.272 114.953 582.476 112.645C529.085 101.227 472.952 100.742 417.512 112.613C406.719 114.924 400.392 125.928 403.232 136.593V136.593C406.077 147.278 417.045 153.569 427.87 151.317C476.358 141.23 525.396 141.633 572.141 151.349C582.962 153.598 593.92 147.307 596.764 136.627V136.627Z");
    			add_location(path0, file, 100, 4, 21161);
    			attr_dev(path1, "d", "M583.896 184.948C586.453 175.346 580.754 165.439 571.033 163.379C525.034 153.63 476.705 153.219 428.956 163.353C419.24 165.416 413.545 175.32 416.101 184.919V184.919C418.661 194.535 428.531 200.193 438.278 198.189C479.77 189.656 521.713 189.994 561.731 198.217C571.474 200.219 581.336 194.56 583.896 184.948V184.948Z");
    			add_location(path1, file, 101, 4, 21498);
    			attr_dev(path2, "d", "M572.06 229.402C574.332 220.867 569.266 212.06 560.623 210.244C521.353 201.992 480.122 201.647 439.371 210.221C430.731 212.039 425.668 220.845 427.94 229.377V229.377C430.216 237.925 438.989 242.953 447.657 241.19C482.845 234.033 518.402 234.313 552.354 241.214C561.018 242.975 569.785 237.946 572.06 229.402V229.402Z");
    			add_location(path2, file, 102, 4, 21833);
    			attr_dev(path3, "d", "M561.251 269.991C563.24 262.523 558.807 254.816 551.242 253.238C518.039 246.312 483.199 246.025 448.755 253.219C441.192 254.798 436.762 262.504 438.749 269.97V269.97C440.741 277.45 448.418 281.848 456.005 280.32C485.581 274.363 515.457 274.594 544.005 280.34C551.59 281.866 559.26 277.467 561.251 269.991V269.991Z");
    			add_location(path3, file, 103, 4, 22168);
    			attr_dev(path4, "d", "M551.471 306.715C553.176 300.314 549.377 293.707 542.891 292.361C515.094 286.593 485.938 286.355 457.106 292.344C450.622 293.691 446.824 300.298 448.529 306.698V306.698C450.236 313.109 456.816 316.878 463.322 315.577C487.979 310.645 512.881 310.834 536.687 315.593C543.19 316.893 549.765 313.123 551.471 306.715V306.715Z");
    			add_location(path4, file, 104, 4, 22500);
    			attr_dev(path5, "d", "M542.723 339.574C544.143 334.24 540.977 328.734 535.572 327.613C512.518 322.834 488.339 322.637 464.428 327.599C459.025 328.72 455.86 334.225 457.28 339.558V339.558C458.702 344.901 464.186 348.042 469.607 346.959C490.04 342.878 510.674 343.036 530.402 346.973C535.822 348.055 541.301 344.914 542.723 339.574V339.574Z");
    			add_location(path5, file, 105, 4, 22839);
    			attr_dev(path6, "d", "M695.527 202.459C686.286 196.398 682.986 184.201 688.526 174.638V174.638C694.062 165.085 706.322 161.781 715.589 167.783C761.412 197.462 801.446 236.81 832.252 284.405C838.249 293.671 834.943 305.925 825.394 311.458V311.458C815.827 317.002 803.624 313.694 797.562 304.447C770.409 263.03 735.45 228.642 695.527 202.459Z");
    			add_location(path6, file, 109, 4, 23194);
    			attr_dev(path7, "d", "M669.747 242.96C661.442 237.487 658.47 226.511 663.457 217.904V217.904C668.439 209.307 679.474 206.332 687.804 211.749C727.223 237.381 761.686 271.263 788.283 312.191C793.696 320.52 790.719 331.551 782.124 336.531V336.531C773.514 341.519 762.534 338.541 757.059 330.232C733.755 294.861 703.857 265.442 669.747 242.96Z");
    			add_location(path7, file, 110, 4, 23531);
    			attr_dev(path8, "d", "M645.975 279.994C638.603 275.113 635.96 265.358 640.393 257.708V257.708C644.821 250.066 654.63 247.421 662.026 252.248C695.629 274.18 725.027 303.092 747.778 337.968C752.603 345.363 749.956 355.171 742.316 359.597V359.597C734.662 364.032 724.903 361.383 720.02 354.007C700.2 324.066 674.86 299.122 645.975 279.994Z");
    			add_location(path8, file, 111, 4, 23867);
    			attr_dev(path9, "d", "M624.212 313.563C617.77 309.28 615.456 300.746 619.335 294.052V294.052C623.209 287.366 631.793 285.05 638.258 289.284C666.632 307.864 691.47 332.295 710.74 361.737C714.97 368.201 712.654 376.783 705.969 380.657V380.657C699.273 384.537 690.734 382.219 686.45 375.773C669.749 350.647 648.46 329.686 624.212 313.563Z");
    			add_location(path9, file, 112, 4, 24200);
    			attr_dev(path10, "d", "M604.458 343.665C598.942 339.986 596.958 332.672 600.282 326.935V326.935C603.603 321.203 610.962 319.217 616.5 322.852C640.233 338.43 661.018 358.877 677.168 383.498C680.801 389.035 678.815 396.391 673.085 399.711V399.711C667.345 403.038 660.026 401.05 656.346 395.53C642.398 374.607 624.657 357.134 604.458 343.665Z");
    			add_location(path10, file, 113, 4, 24532);
    			attr_dev(path11, "d", "M586.714 370.299C582.117 367.232 580.464 361.137 583.234 356.356V356.356C586.001 351.579 592.134 349.925 596.748 352.955C616.428 365.877 633.663 382.835 647.061 403.25C650.089 407.863 648.434 413.994 643.659 416.76V416.76C638.876 419.532 632.778 417.876 629.71 413.277C618.148 395.943 603.447 381.464 586.714 370.299Z");
    			add_location(path11, file, 114, 4, 24867);
    			attr_dev(path12, "d", "M863.406 403.232C852.722 406.077 846.432 417.044 848.684 427.869C858.771 476.355 858.367 525.391 848.651 572.135C846.402 582.956 852.693 593.915 863.373 596.759V596.759C874.042 599.6 885.048 593.267 887.357 582.47C898.773 529.081 899.257 472.95 887.386 417.511C885.075 406.719 874.071 400.391 863.406 403.232V403.232Z");
    			add_location(path12, file, 118, 4, 25227);
    			attr_dev(path13, "d", "M815.082 416.099C805.466 418.659 799.808 428.529 801.813 438.276C810.345 479.767 810.008 521.71 801.784 561.727C799.782 571.47 805.442 581.332 815.053 583.892V583.892C824.655 586.449 834.562 580.75 836.622 571.029C846.371 525.031 846.78 476.703 836.647 428.955C834.585 419.238 824.681 413.543 815.082 416.099V416.099Z");
    			add_location(path13, file, 119, 4, 25563);
    			attr_dev(path14, "d", "M770.624 427.938C762.077 430.214 757.049 438.988 758.811 447.655C765.968 482.842 765.688 518.398 758.787 552.348C757.026 561.013 762.055 569.779 770.598 572.055V572.055C779.134 574.328 787.941 569.262 789.757 560.618C798.009 521.349 798.354 480.118 789.78 439.369C787.962 430.729 779.156 425.666 770.624 427.938V427.938Z");
    			add_location(path14, file, 120, 4, 25899);
    			attr_dev(path15, "d", "M730.031 438.747C722.551 440.739 718.153 448.416 719.681 456.003C725.638 485.579 725.408 515.454 719.662 544.001C718.135 551.586 722.534 559.257 730.01 561.247V561.247C737.478 563.236 745.185 558.803 746.763 551.238C753.689 518.036 753.976 483.197 746.782 448.753C745.203 441.19 737.497 436.76 730.031 438.747V438.747Z");
    			add_location(path15, file, 121, 4, 26238);
    			attr_dev(path16, "d", "M684.407 536.682C683.107 543.185 686.876 549.761 693.285 551.467V551.467C699.687 553.172 706.294 549.372 707.64 542.886C713.407 515.09 713.646 485.934 707.657 457.104C706.31 450.62 699.703 446.822 693.304 448.527V448.527C686.892 450.234 683.123 456.814 684.424 463.32C689.356 487.977 689.165 512.877 684.407 536.682Z");
    			add_location(path16, file, 122, 4, 26575);
    			attr_dev(path17, "d", "M653.042 469.605C651.959 464.183 655.1 458.7 660.442 457.277V457.277C665.775 455.857 671.281 459.021 672.403 464.425C677.364 488.335 677.167 512.514 672.388 535.568C671.268 540.973 665.762 544.139 660.427 542.719V542.719C655.087 541.297 651.946 535.818 653.028 530.399C656.965 510.671 657.123 490.037 653.042 469.605Z");
    			add_location(path17, file, 123, 4, 26910);
    			attr_dev(path18, "d", "M832.218 715.585C838.22 706.318 834.916 694.058 825.363 688.523V688.523C815.8 682.982 803.604 686.282 797.542 695.524C771.359 735.447 736.97 770.407 695.552 797.56C686.305 803.622 682.997 815.825 688.541 825.391V825.391C694.074 834.941 706.328 838.247 715.594 832.25C763.19 801.443 802.539 761.409 832.218 715.585Z");
    			add_location(path18, file, 127, 4, 27274);
    			attr_dev(path19, "d", "M782.099 663.454C773.493 658.467 762.517 661.438 757.043 669.744C734.561 703.855 705.142 733.752 669.769 757.057C661.46 762.532 658.482 773.512 663.47 782.122V782.122C668.45 790.717 679.481 793.693 687.81 788.281C728.738 761.683 762.622 727.219 788.254 687.801C793.671 679.47 790.697 668.436 782.099 663.454V663.454Z");
    			add_location(path19, file, 128, 4, 27607);
    			attr_dev(path20, "d", "M742.294 640.389C734.644 635.956 724.889 638.599 720.007 645.971C700.879 674.858 675.935 700.198 645.994 720.018C638.618 724.901 635.969 734.66 640.404 742.314V742.314C644.83 749.954 654.637 752.601 662.033 747.777C696.911 725.025 725.822 695.627 747.754 662.024C752.582 654.627 749.936 644.818 742.294 640.389V640.389Z");
    			add_location(path20, file, 129, 4, 27942);
    			attr_dev(path21, "d", "M624.228 686.448C617.782 690.732 615.464 699.271 619.345 705.967V705.967C623.218 712.652 631.8 714.968 638.264 710.738C667.706 691.468 692.138 666.63 710.719 638.255C714.953 631.79 712.637 623.205 705.95 619.331V619.331C699.256 615.452 690.722 617.766 686.438 624.208C670.315 648.457 649.353 669.746 624.228 686.448Z");
    			add_location(path21, file, 130, 4, 28280);
    			attr_dev(path22, "d", "M604.471 656.342C598.951 660.022 596.963 667.341 600.29 673.081V673.081C603.61 678.812 610.967 680.798 616.505 677.165C641.126 661.014 661.574 640.229 677.15 616.496C680.785 610.958 678.799 603.599 673.068 600.278V600.278C667.33 596.953 660.015 598.937 656.335 604.454C642.866 624.652 625.393 642.394 604.471 656.342Z");
    			add_location(path22, file, 131, 4, 28615);
    			attr_dev(path23, "d", "M629.702 586.71C632.769 582.113 638.864 580.46 643.645 583.23V583.23C648.422 585.997 650.077 592.13 647.047 596.744C634.124 616.424 617.167 633.661 596.751 647.059C592.138 650.087 586.007 648.432 583.241 643.657V643.657C580.469 638.874 582.125 632.776 586.724 629.708C604.058 618.145 618.537 603.444 629.702 586.71Z");
    			add_location(path23, file, 132, 4, 28951);
    			attr_dev(path24, "d", "M582.49 887.384C593.282 885.073 599.61 874.069 596.769 863.404V863.404C593.924 852.72 582.957 846.43 572.132 848.682C523.646 858.768 474.61 858.365 427.866 848.65C417.045 846.401 406.087 852.693 403.243 863.373V863.373C400.403 874.041 406.735 885.046 417.532 887.355C470.92 898.772 527.052 899.256 582.49 887.384Z");
    			add_location(path24, file, 136, 4, 29309);
    			attr_dev(path25, "d", "M571.046 836.645C580.763 834.583 586.458 824.679 583.902 815.08V815.08C581.342 805.464 571.472 799.806 561.725 801.81C520.235 810.343 478.292 810.006 438.276 801.783C428.533 799.781 418.67 805.44 416.111 815.052V815.052C413.554 824.654 419.253 834.56 428.974 836.62C474.972 846.369 523.298 846.778 571.046 836.645Z");
    			add_location(path25, file, 137, 4, 29641);
    			attr_dev(path26, "d", "M447.653 758.785C438.989 757.024 430.222 762.053 427.947 770.597V770.597C425.675 779.132 430.741 787.939 439.384 789.756C478.653 798.008 519.883 798.352 560.631 789.778C569.272 787.96 574.335 779.154 572.063 770.621V770.621C569.787 762.073 561.013 757.045 552.345 758.808C517.159 765.964 481.603 765.684 447.653 758.785Z");
    			add_location(path26, file, 138, 4, 29974);
    			attr_dev(path27, "d", "M456.001 719.659C448.417 718.133 440.746 722.532 438.756 730.008V730.008C436.767 737.476 441.2 745.183 448.766 746.761C481.968 753.686 516.807 753.974 551.25 746.781C558.813 745.201 563.243 737.495 561.256 730.029V730.029C559.264 722.55 551.587 718.151 543.999 719.679C514.424 725.636 484.548 725.404 456.001 719.659Z");
    			add_location(path27, file, 139, 4, 30313);
    			attr_dev(path28, "d", "M463.319 684.406C456.817 683.106 450.242 686.876 448.536 693.284V693.284C446.831 699.685 450.631 706.292 457.117 707.638C484.913 713.405 514.069 713.643 542.899 707.653C549.382 706.306 553.179 699.7 551.476 693.301V693.301C549.769 686.891 543.189 683.121 536.684 684.422C512.026 689.354 487.125 689.164 463.319 684.406Z");
    			add_location(path28, file, 140, 4, 30649);
    			attr_dev(path29, "d", "M530.399 653.04C535.82 651.957 541.303 655.098 542.725 660.44V660.44C544.145 665.772 540.981 671.277 535.578 672.398C511.668 677.36 487.489 677.163 464.436 672.386C459.03 671.266 455.864 665.76 457.284 660.425V660.425C458.706 655.085 464.185 651.944 469.604 653.026C489.332 656.964 509.966 657.121 530.399 653.04Z");
    			add_location(path29, file, 141, 4, 30987);
    			attr_dev(path30, "d", "M284.418 832.219C293.685 838.22 305.945 834.916 311.48 825.363V825.363C317.021 815.801 313.721 803.604 304.479 797.543C264.554 771.359 229.594 736.97 202.441 695.551C196.379 686.305 184.176 682.997 174.609 688.54V688.54C165.059 694.073 161.753 706.329 167.75 715.595C198.558 763.19 238.593 802.54 284.418 832.219Z");
    			add_location(path30, file, 144, 4, 31341);
    			attr_dev(path31, "d", "M312.202 788.253C320.532 793.67 331.567 790.695 336.549 782.098V782.098C341.536 773.491 338.564 762.515 330.259 757.041C296.147 734.559 266.249 705.14 242.944 669.767C237.469 661.458 226.489 658.48 217.879 663.468V663.468C209.284 668.448 206.308 679.479 211.72 687.808C238.319 728.736 272.782 762.62 312.202 788.253Z");
    			add_location(path31, file, 145, 4, 31673);
    			attr_dev(path32, "d", "M279.984 645.993C275.101 638.616 265.341 635.968 257.687 640.403V640.403C250.048 644.83 247.401 654.637 252.225 662.032C274.977 696.91 304.376 725.821 337.979 747.753C345.376 752.58 355.185 749.935 359.614 742.292V742.292C364.047 734.642 361.404 724.887 354.032 720.005C325.145 700.877 299.805 675.934 279.984 645.993Z");
    			add_location(path32, file, 146, 4, 32008);
    			attr_dev(path33, "d", "M313.553 624.226C309.269 617.78 300.73 615.462 294.034 619.343V619.343C287.349 623.216 285.033 631.798 289.263 638.262C308.533 667.704 333.373 692.136 361.748 710.717C368.213 714.951 376.798 712.635 380.672 705.948V705.948C384.551 699.254 382.237 690.72 375.794 686.436C351.545 670.313 330.255 649.352 313.553 624.226Z");
    			add_location(path33, file, 147, 4, 32345);
    			attr_dev(path34, "d", "M343.658 604.47C339.978 598.95 332.66 596.963 326.92 600.288V600.288C321.19 603.608 319.203 610.965 322.836 616.503C338.988 641.124 359.773 661.572 383.507 677.148C389.045 680.783 396.404 678.797 399.725 673.065V673.065C403.049 667.328 401.065 660.013 395.548 656.334C375.349 642.865 357.606 625.393 343.658 604.47Z");
    			add_location(path34, file, 148, 4, 32682);
    			attr_dev(path35, "d", "M413.291 629.7C417.889 632.767 419.542 638.863 416.772 643.645V643.645C414.004 648.422 407.871 650.077 403.256 647.046C383.576 634.123 366.341 617.165 352.942 596.749C349.914 592.136 351.569 586.005 356.344 583.239V583.239C361.127 580.467 367.225 582.123 370.293 586.723C381.855 604.056 396.557 618.535 413.291 629.7Z");
    			add_location(path35, file, 149, 4, 33016);
    			attr_dev(path36, "d", "M112.615 582.489C114.926 593.282 125.93 599.609 136.595 596.769V596.769C147.28 593.924 153.571 582.956 151.318 572.131C141.231 523.645 141.634 474.607 151.35 427.863C153.599 417.042 147.309 406.084 136.629 403.24V403.24C125.96 400.399 114.955 406.732 112.646 417.528C101.229 470.917 100.744 527.05 112.615 582.489Z");
    			add_location(path36, file, 152, 4, 33374);
    			attr_dev(path37, "d", "M163.356 571.044C165.418 580.761 175.322 586.456 184.921 583.9V583.9C194.537 581.34 200.195 571.47 198.19 561.723C189.658 520.232 189.995 478.289 198.219 438.272C200.221 428.529 194.561 418.667 184.95 416.107V416.107C175.348 413.55 165.441 419.249 163.381 428.97C153.632 474.968 153.223 523.296 163.356 571.044Z");
    			add_location(path37, file, 153, 4, 33707);
    			attr_dev(path38, "d", "M229.405 427.944C220.869 425.671 212.062 430.737 210.246 439.381C201.994 478.65 201.649 519.882 210.222 560.631C212.041 569.272 220.847 574.334 229.38 572.062V572.062C237.927 569.785 242.955 561.012 241.192 552.344C234.035 517.157 234.315 481.601 241.216 447.651C242.977 438.986 237.948 430.22 229.405 427.944V427.944Z");
    			add_location(path38, file, 154, 4, 34037);
    			attr_dev(path39, "d", "M280.342 455.998C281.868 448.413 277.469 440.743 269.993 438.752V438.752C262.525 436.763 254.818 441.196 253.24 448.762C246.314 481.963 246.027 516.804 253.22 551.248C254.8 558.811 262.506 563.241 269.972 561.254V561.254C277.451 559.262 281.85 551.585 280.322 543.998C274.365 514.422 274.597 484.546 280.342 455.998Z");
    			add_location(path39, file, 155, 4, 34374);
    			attr_dev(path40, "d", "M315.595 463.316C316.895 456.813 313.125 450.238 306.717 448.531V448.531C300.316 446.827 293.709 450.626 292.363 457.112C286.595 484.909 286.356 514.065 292.346 542.896C293.693 549.38 300.299 553.177 306.698 551.474V551.474C313.11 549.767 316.879 543.186 315.578 536.68C310.646 512.023 310.836 487.121 315.595 463.316Z");
    			add_location(path40, file, 156, 4, 34709);
    			attr_dev(path41, "d", "M346.961 530.397C348.044 535.818 344.903 541.301 339.561 542.723V542.723C334.229 544.143 328.724 540.979 327.603 535.576C322.64 511.666 322.836 487.486 327.615 464.432C328.735 459.027 334.241 455.861 339.575 457.281V457.281C344.915 458.703 348.057 464.182 346.975 469.601C343.037 489.33 342.88 509.964 346.961 530.397Z");
    			add_location(path41, file, 157, 4, 35046);
    			attr_dev(path42, "d", "M167.785 284.414C161.783 293.681 165.087 305.941 174.64 311.476V311.476C184.203 317.017 196.399 313.717 202.461 304.475C228.644 264.552 263.032 229.592 304.449 202.439C313.696 196.377 317.004 184.174 311.46 174.607V174.607C305.927 165.058 293.673 161.752 284.407 167.749C236.812 198.555 197.463 238.589 167.785 284.414Z");
    			add_location(path42, file, 160, 4, 35405);
    			attr_dev(path43, "d", "M336.532 217.876C331.551 209.282 320.52 206.305 312.191 211.718C271.263 238.316 237.381 272.779 211.748 312.198C206.332 320.529 209.306 331.563 217.904 336.545V336.545C226.51 341.532 237.486 338.561 242.96 330.255C265.442 296.144 294.862 266.247 330.233 242.942C338.543 237.467 341.521 226.486 336.532 217.876V217.876Z");
    			add_location(path43, file, 161, 4, 35743);
    			attr_dev(path44, "d", "M359.598 257.685C355.171 250.045 345.364 247.399 337.969 252.223C303.091 274.974 274.181 304.372 252.249 337.975C247.421 345.372 250.067 355.182 257.709 359.61V359.61C265.359 364.043 275.114 361.4 279.996 354.028C299.124 325.142 324.067 299.802 354.008 279.982C361.384 275.099 364.033 265.339 359.598 257.685V257.685Z");
    			add_location(path44, file, 162, 4, 36080);
    			attr_dev(path45, "d", "M380.658 294.032C376.785 287.347 368.203 285.031 361.739 289.261C332.297 308.531 307.865 333.369 289.284 361.744C285.05 368.209 287.366 376.794 294.053 380.668V380.668C300.747 384.547 309.281 382.233 313.565 375.791C329.688 351.541 350.649 330.252 375.775 313.551C382.221 309.267 384.539 300.728 380.658 294.032V294.032Z");
    			add_location(path45, file, 163, 4, 36416);
    			attr_dev(path46, "d", "M395.532 343.655C401.052 339.975 403.04 332.656 399.713 326.916V326.916C396.393 321.186 389.037 319.201 383.5 322.833C358.879 338.985 338.431 359.769 322.854 383.503C319.219 389.041 321.204 396.4 326.936 399.721V399.721C332.674 403.045 339.988 401.061 343.667 395.544C357.136 375.346 374.608 357.603 395.532 343.655Z");
    			add_location(path46, file, 164, 4, 36755);
    			attr_dev(path47, "d", "M370.301 413.288C367.234 417.885 361.138 419.538 356.357 416.768V416.768C351.581 414 349.926 407.868 352.956 403.253C365.879 383.573 382.836 366.336 403.251 352.938C407.865 349.91 413.996 351.566 416.763 356.341V356.341C419.534 361.125 417.877 367.223 413.278 370.291C395.944 381.853 381.466 396.554 370.301 413.288Z");
    			add_location(path47, file, 165, 4, 37090);
    			attr_dev(svg1, "class", "shadow svelte-vlo288");
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg1, "viewBox", "0 0 1000 1000");
    			attr_dev(svg1, "fill", "none");
    			add_location(svg1, file, 96, 2, 21044);
    			attr_dev(div, "class", "container svelte-vlo288");
    			add_location(div, file, 16, 0, 260);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg0);
    			if (if_block0) if_block0.m(svg0, null);
    			append_dev(svg0, if_block0_anchor);
    			if (if_block1) if_block1.m(svg0, null);
    			append_dev(svg0, if_block1_anchor);
    			if (if_block2) if_block2.m(svg0, null);
    			append_dev(svg0, if_block2_anchor);
    			if (if_block3) if_block3.m(svg0, null);
    			append_dev(svg0, if_block3_anchor);
    			if (if_block4) if_block4.m(svg0, null);
    			append_dev(svg0, if_block4_anchor);
    			if (if_block5) if_block5.m(svg0, null);
    			append_dev(svg0, if_block5_anchor);
    			if (if_block6) if_block6.m(svg0, null);
    			append_dev(svg0, if_block6_anchor);
    			if (if_block7) if_block7.m(svg0, null);
    			append_dev(svg0, if_block7_anchor);
    			if (if_block8) if_block8.m(svg0, null);
    			append_dev(svg0, if_block8_anchor);
    			if (if_block9) if_block9.m(svg0, null);
    			append_dev(svg0, if_block9_anchor);
    			if (if_block10) if_block10.m(svg0, null);
    			append_dev(svg0, if_block10_anchor);
    			if (if_block11) if_block11.m(svg0, null);
    			append_dev(svg0, if_block11_anchor);
    			if (if_block12) if_block12.m(svg0, null);
    			append_dev(svg0, if_block12_anchor);
    			if (if_block13) if_block13.m(svg0, null);
    			append_dev(svg0, if_block13_anchor);
    			if (if_block14) if_block14.m(svg0, null);
    			append_dev(svg0, if_block14_anchor);
    			if (if_block15) if_block15.m(svg0, null);
    			append_dev(svg0, if_block15_anchor);
    			if (if_block16) if_block16.m(svg0, null);
    			append_dev(svg0, if_block16_anchor);
    			if (if_block17) if_block17.m(svg0, null);
    			append_dev(svg0, if_block17_anchor);
    			if (if_block18) if_block18.m(svg0, null);
    			append_dev(svg0, if_block18_anchor);
    			if (if_block19) if_block19.m(svg0, null);
    			append_dev(svg0, if_block19_anchor);
    			if (if_block20) if_block20.m(svg0, null);
    			append_dev(svg0, if_block20_anchor);
    			if (if_block21) if_block21.m(svg0, null);
    			append_dev(svg0, if_block21_anchor);
    			if (if_block22) if_block22.m(svg0, null);
    			append_dev(svg0, if_block22_anchor);
    			if (if_block23) if_block23.m(svg0, null);
    			append_dev(svg0, if_block23_anchor);
    			if (if_block24) if_block24.m(svg0, null);
    			append_dev(svg0, if_block24_anchor);
    			if (if_block25) if_block25.m(svg0, null);
    			append_dev(svg0, if_block25_anchor);
    			if (if_block26) if_block26.m(svg0, null);
    			append_dev(svg0, if_block26_anchor);
    			if (if_block27) if_block27.m(svg0, null);
    			append_dev(svg0, if_block27_anchor);
    			if (if_block28) if_block28.m(svg0, null);
    			append_dev(svg0, if_block28_anchor);
    			if (if_block29) if_block29.m(svg0, null);
    			append_dev(svg0, if_block29_anchor);
    			if (if_block30) if_block30.m(svg0, null);
    			append_dev(svg0, if_block30_anchor);
    			if (if_block31) if_block31.m(svg0, null);
    			append_dev(svg0, if_block31_anchor);
    			if (if_block32) if_block32.m(svg0, null);
    			append_dev(svg0, if_block32_anchor);
    			if (if_block33) if_block33.m(svg0, null);
    			append_dev(svg0, if_block33_anchor);
    			if (if_block34) if_block34.m(svg0, null);
    			append_dev(svg0, if_block34_anchor);
    			if (if_block35) if_block35.m(svg0, null);
    			append_dev(svg0, if_block35_anchor);
    			if (if_block36) if_block36.m(svg0, null);
    			append_dev(svg0, if_block36_anchor);
    			if (if_block37) if_block37.m(svg0, null);
    			append_dev(svg0, if_block37_anchor);
    			if (if_block38) if_block38.m(svg0, null);
    			append_dev(svg0, if_block38_anchor);
    			if (if_block39) if_block39.m(svg0, null);
    			append_dev(svg0, if_block39_anchor);
    			if (if_block40) if_block40.m(svg0, null);
    			append_dev(svg0, if_block40_anchor);
    			if (if_block41) if_block41.m(svg0, null);
    			append_dev(svg0, if_block41_anchor);
    			if (if_block42) if_block42.m(svg0, null);
    			append_dev(svg0, if_block42_anchor);
    			if (if_block43) if_block43.m(svg0, null);
    			append_dev(svg0, if_block43_anchor);
    			if (if_block44) if_block44.m(svg0, null);
    			append_dev(svg0, if_block44_anchor);
    			if (if_block45) if_block45.m(svg0, null);
    			append_dev(svg0, if_block45_anchor);
    			if (if_block46) if_block46.m(svg0, null);
    			append_dev(svg0, if_block46_anchor);
    			if (if_block47) if_block47.m(svg0, null);
    			append_dev(svg0, defs);
    			append_dev(defs, linearGradient);
    			append_dev(linearGradient, stop0);
    			append_dev(linearGradient, stop1);
    			append_dev(div, t);
    			append_dev(div, svg1);
    			append_dev(svg1, path0);
    			append_dev(svg1, path1);
    			append_dev(svg1, path2);
    			append_dev(svg1, path3);
    			append_dev(svg1, path4);
    			append_dev(svg1, path5);
    			append_dev(svg1, path6);
    			append_dev(svg1, path7);
    			append_dev(svg1, path8);
    			append_dev(svg1, path9);
    			append_dev(svg1, path10);
    			append_dev(svg1, path11);
    			append_dev(svg1, path12);
    			append_dev(svg1, path13);
    			append_dev(svg1, path14);
    			append_dev(svg1, path15);
    			append_dev(svg1, path16);
    			append_dev(svg1, path17);
    			append_dev(svg1, path18);
    			append_dev(svg1, path19);
    			append_dev(svg1, path20);
    			append_dev(svg1, path21);
    			append_dev(svg1, path22);
    			append_dev(svg1, path23);
    			append_dev(svg1, path24);
    			append_dev(svg1, path25);
    			append_dev(svg1, path26);
    			append_dev(svg1, path27);
    			append_dev(svg1, path28);
    			append_dev(svg1, path29);
    			append_dev(svg1, path30);
    			append_dev(svg1, path31);
    			append_dev(svg1, path32);
    			append_dev(svg1, path33);
    			append_dev(svg1, path34);
    			append_dev(svg1, path35);
    			append_dev(svg1, path36);
    			append_dev(svg1, path37);
    			append_dev(svg1, path38);
    			append_dev(svg1, path39);
    			append_dev(svg1, path40);
    			append_dev(svg1, path41);
    			append_dev(svg1, path42);
    			append_dev(svg1, path43);
    			append_dev(svg1, path44);
    			append_dev(svg1, path45);
    			append_dev(svg1, path46);
    			append_dev(svg1, path47);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*animatedLevels*/ ctx[0][0] >= 6) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_47(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(svg0, if_block0_anchor);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][0] >= 5) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_46(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(svg0, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][0] >= 4) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_45(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(svg0, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][0] >= 3) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block3, 1);
    					}
    				} else {
    					if_block3 = create_if_block_44(ctx);
    					if_block3.c();
    					transition_in(if_block3, 1);
    					if_block3.m(svg0, if_block3_anchor);
    				}
    			} else if (if_block3) {
    				group_outros();

    				transition_out(if_block3, 1, 1, () => {
    					if_block3 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][0] >= 2) {
    				if (if_block4) {
    					if_block4.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block4, 1);
    					}
    				} else {
    					if_block4 = create_if_block_43(ctx);
    					if_block4.c();
    					transition_in(if_block4, 1);
    					if_block4.m(svg0, if_block4_anchor);
    				}
    			} else if (if_block4) {
    				group_outros();

    				transition_out(if_block4, 1, 1, () => {
    					if_block4 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][0] >= 1) {
    				if (if_block5) {
    					if_block5.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block5, 1);
    					}
    				} else {
    					if_block5 = create_if_block_42(ctx);
    					if_block5.c();
    					transition_in(if_block5, 1);
    					if_block5.m(svg0, if_block5_anchor);
    				}
    			} else if (if_block5) {
    				group_outros();

    				transition_out(if_block5, 1, 1, () => {
    					if_block5 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][1] >= 6) {
    				if (if_block6) {
    					if_block6.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block6, 1);
    					}
    				} else {
    					if_block6 = create_if_block_41(ctx);
    					if_block6.c();
    					transition_in(if_block6, 1);
    					if_block6.m(svg0, if_block6_anchor);
    				}
    			} else if (if_block6) {
    				group_outros();

    				transition_out(if_block6, 1, 1, () => {
    					if_block6 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][1] >= 5) {
    				if (if_block7) {
    					if_block7.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block7, 1);
    					}
    				} else {
    					if_block7 = create_if_block_40(ctx);
    					if_block7.c();
    					transition_in(if_block7, 1);
    					if_block7.m(svg0, if_block7_anchor);
    				}
    			} else if (if_block7) {
    				group_outros();

    				transition_out(if_block7, 1, 1, () => {
    					if_block7 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][1] >= 4) {
    				if (if_block8) {
    					if_block8.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block8, 1);
    					}
    				} else {
    					if_block8 = create_if_block_39(ctx);
    					if_block8.c();
    					transition_in(if_block8, 1);
    					if_block8.m(svg0, if_block8_anchor);
    				}
    			} else if (if_block8) {
    				group_outros();

    				transition_out(if_block8, 1, 1, () => {
    					if_block8 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][1] >= 3) {
    				if (if_block9) {
    					if_block9.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block9, 1);
    					}
    				} else {
    					if_block9 = create_if_block_38(ctx);
    					if_block9.c();
    					transition_in(if_block9, 1);
    					if_block9.m(svg0, if_block9_anchor);
    				}
    			} else if (if_block9) {
    				group_outros();

    				transition_out(if_block9, 1, 1, () => {
    					if_block9 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][1] >= 2) {
    				if (if_block10) {
    					if_block10.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block10, 1);
    					}
    				} else {
    					if_block10 = create_if_block_37(ctx);
    					if_block10.c();
    					transition_in(if_block10, 1);
    					if_block10.m(svg0, if_block10_anchor);
    				}
    			} else if (if_block10) {
    				group_outros();

    				transition_out(if_block10, 1, 1, () => {
    					if_block10 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][1] >= 1) {
    				if (if_block11) {
    					if_block11.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block11, 1);
    					}
    				} else {
    					if_block11 = create_if_block_36(ctx);
    					if_block11.c();
    					transition_in(if_block11, 1);
    					if_block11.m(svg0, if_block11_anchor);
    				}
    			} else if (if_block11) {
    				group_outros();

    				transition_out(if_block11, 1, 1, () => {
    					if_block11 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][2] >= 6) {
    				if (if_block12) {
    					if_block12.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block12, 1);
    					}
    				} else {
    					if_block12 = create_if_block_35(ctx);
    					if_block12.c();
    					transition_in(if_block12, 1);
    					if_block12.m(svg0, if_block12_anchor);
    				}
    			} else if (if_block12) {
    				group_outros();

    				transition_out(if_block12, 1, 1, () => {
    					if_block12 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][2] >= 5) {
    				if (if_block13) {
    					if_block13.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block13, 1);
    					}
    				} else {
    					if_block13 = create_if_block_34(ctx);
    					if_block13.c();
    					transition_in(if_block13, 1);
    					if_block13.m(svg0, if_block13_anchor);
    				}
    			} else if (if_block13) {
    				group_outros();

    				transition_out(if_block13, 1, 1, () => {
    					if_block13 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][2] >= 4) {
    				if (if_block14) {
    					if_block14.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block14, 1);
    					}
    				} else {
    					if_block14 = create_if_block_33(ctx);
    					if_block14.c();
    					transition_in(if_block14, 1);
    					if_block14.m(svg0, if_block14_anchor);
    				}
    			} else if (if_block14) {
    				group_outros();

    				transition_out(if_block14, 1, 1, () => {
    					if_block14 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][2] >= 3) {
    				if (if_block15) {
    					if_block15.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block15, 1);
    					}
    				} else {
    					if_block15 = create_if_block_32(ctx);
    					if_block15.c();
    					transition_in(if_block15, 1);
    					if_block15.m(svg0, if_block15_anchor);
    				}
    			} else if (if_block15) {
    				group_outros();

    				transition_out(if_block15, 1, 1, () => {
    					if_block15 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][2] >= 2) {
    				if (if_block16) {
    					if_block16.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block16, 1);
    					}
    				} else {
    					if_block16 = create_if_block_31(ctx);
    					if_block16.c();
    					transition_in(if_block16, 1);
    					if_block16.m(svg0, if_block16_anchor);
    				}
    			} else if (if_block16) {
    				group_outros();

    				transition_out(if_block16, 1, 1, () => {
    					if_block16 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][2] >= 1) {
    				if (if_block17) {
    					if_block17.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block17, 1);
    					}
    				} else {
    					if_block17 = create_if_block_30(ctx);
    					if_block17.c();
    					transition_in(if_block17, 1);
    					if_block17.m(svg0, if_block17_anchor);
    				}
    			} else if (if_block17) {
    				group_outros();

    				transition_out(if_block17, 1, 1, () => {
    					if_block17 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][3] >= 6) {
    				if (if_block18) {
    					if_block18.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block18, 1);
    					}
    				} else {
    					if_block18 = create_if_block_29(ctx);
    					if_block18.c();
    					transition_in(if_block18, 1);
    					if_block18.m(svg0, if_block18_anchor);
    				}
    			} else if (if_block18) {
    				group_outros();

    				transition_out(if_block18, 1, 1, () => {
    					if_block18 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][3] >= 5) {
    				if (if_block19) {
    					if_block19.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block19, 1);
    					}
    				} else {
    					if_block19 = create_if_block_28(ctx);
    					if_block19.c();
    					transition_in(if_block19, 1);
    					if_block19.m(svg0, if_block19_anchor);
    				}
    			} else if (if_block19) {
    				group_outros();

    				transition_out(if_block19, 1, 1, () => {
    					if_block19 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][3] >= 4) {
    				if (if_block20) {
    					if_block20.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block20, 1);
    					}
    				} else {
    					if_block20 = create_if_block_27(ctx);
    					if_block20.c();
    					transition_in(if_block20, 1);
    					if_block20.m(svg0, if_block20_anchor);
    				}
    			} else if (if_block20) {
    				group_outros();

    				transition_out(if_block20, 1, 1, () => {
    					if_block20 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][3] >= 3) {
    				if (if_block21) {
    					if_block21.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block21, 1);
    					}
    				} else {
    					if_block21 = create_if_block_26(ctx);
    					if_block21.c();
    					transition_in(if_block21, 1);
    					if_block21.m(svg0, if_block21_anchor);
    				}
    			} else if (if_block21) {
    				group_outros();

    				transition_out(if_block21, 1, 1, () => {
    					if_block21 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][3] >= 2) {
    				if (if_block22) {
    					if_block22.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block22, 1);
    					}
    				} else {
    					if_block22 = create_if_block_25(ctx);
    					if_block22.c();
    					transition_in(if_block22, 1);
    					if_block22.m(svg0, if_block22_anchor);
    				}
    			} else if (if_block22) {
    				group_outros();

    				transition_out(if_block22, 1, 1, () => {
    					if_block22 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][3] >= 1) {
    				if (if_block23) {
    					if_block23.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block23, 1);
    					}
    				} else {
    					if_block23 = create_if_block_24(ctx);
    					if_block23.c();
    					transition_in(if_block23, 1);
    					if_block23.m(svg0, if_block23_anchor);
    				}
    			} else if (if_block23) {
    				group_outros();

    				transition_out(if_block23, 1, 1, () => {
    					if_block23 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][4] >= 6) {
    				if (if_block24) {
    					if_block24.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block24, 1);
    					}
    				} else {
    					if_block24 = create_if_block_23(ctx);
    					if_block24.c();
    					transition_in(if_block24, 1);
    					if_block24.m(svg0, if_block24_anchor);
    				}
    			} else if (if_block24) {
    				group_outros();

    				transition_out(if_block24, 1, 1, () => {
    					if_block24 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][4] >= 5) {
    				if (if_block25) {
    					if_block25.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block25, 1);
    					}
    				} else {
    					if_block25 = create_if_block_22(ctx);
    					if_block25.c();
    					transition_in(if_block25, 1);
    					if_block25.m(svg0, if_block25_anchor);
    				}
    			} else if (if_block25) {
    				group_outros();

    				transition_out(if_block25, 1, 1, () => {
    					if_block25 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][4] >= 4) {
    				if (if_block26) {
    					if_block26.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block26, 1);
    					}
    				} else {
    					if_block26 = create_if_block_21(ctx);
    					if_block26.c();
    					transition_in(if_block26, 1);
    					if_block26.m(svg0, if_block26_anchor);
    				}
    			} else if (if_block26) {
    				group_outros();

    				transition_out(if_block26, 1, 1, () => {
    					if_block26 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][4] >= 3) {
    				if (if_block27) {
    					if_block27.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block27, 1);
    					}
    				} else {
    					if_block27 = create_if_block_20(ctx);
    					if_block27.c();
    					transition_in(if_block27, 1);
    					if_block27.m(svg0, if_block27_anchor);
    				}
    			} else if (if_block27) {
    				group_outros();

    				transition_out(if_block27, 1, 1, () => {
    					if_block27 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][4] >= 2) {
    				if (if_block28) {
    					if_block28.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block28, 1);
    					}
    				} else {
    					if_block28 = create_if_block_19(ctx);
    					if_block28.c();
    					transition_in(if_block28, 1);
    					if_block28.m(svg0, if_block28_anchor);
    				}
    			} else if (if_block28) {
    				group_outros();

    				transition_out(if_block28, 1, 1, () => {
    					if_block28 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][4] >= 1) {
    				if (if_block29) {
    					if_block29.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block29, 1);
    					}
    				} else {
    					if_block29 = create_if_block_18(ctx);
    					if_block29.c();
    					transition_in(if_block29, 1);
    					if_block29.m(svg0, if_block29_anchor);
    				}
    			} else if (if_block29) {
    				group_outros();

    				transition_out(if_block29, 1, 1, () => {
    					if_block29 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][5] >= 6) {
    				if (if_block30) {
    					if_block30.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block30, 1);
    					}
    				} else {
    					if_block30 = create_if_block_17(ctx);
    					if_block30.c();
    					transition_in(if_block30, 1);
    					if_block30.m(svg0, if_block30_anchor);
    				}
    			} else if (if_block30) {
    				group_outros();

    				transition_out(if_block30, 1, 1, () => {
    					if_block30 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][5] >= 5) {
    				if (if_block31) {
    					if_block31.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block31, 1);
    					}
    				} else {
    					if_block31 = create_if_block_16(ctx);
    					if_block31.c();
    					transition_in(if_block31, 1);
    					if_block31.m(svg0, if_block31_anchor);
    				}
    			} else if (if_block31) {
    				group_outros();

    				transition_out(if_block31, 1, 1, () => {
    					if_block31 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][5] >= 4) {
    				if (if_block32) {
    					if_block32.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block32, 1);
    					}
    				} else {
    					if_block32 = create_if_block_15(ctx);
    					if_block32.c();
    					transition_in(if_block32, 1);
    					if_block32.m(svg0, if_block32_anchor);
    				}
    			} else if (if_block32) {
    				group_outros();

    				transition_out(if_block32, 1, 1, () => {
    					if_block32 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][5] >= 3) {
    				if (if_block33) {
    					if_block33.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block33, 1);
    					}
    				} else {
    					if_block33 = create_if_block_14(ctx);
    					if_block33.c();
    					transition_in(if_block33, 1);
    					if_block33.m(svg0, if_block33_anchor);
    				}
    			} else if (if_block33) {
    				group_outros();

    				transition_out(if_block33, 1, 1, () => {
    					if_block33 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][5] >= 2) {
    				if (if_block34) {
    					if_block34.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block34, 1);
    					}
    				} else {
    					if_block34 = create_if_block_13(ctx);
    					if_block34.c();
    					transition_in(if_block34, 1);
    					if_block34.m(svg0, if_block34_anchor);
    				}
    			} else if (if_block34) {
    				group_outros();

    				transition_out(if_block34, 1, 1, () => {
    					if_block34 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][5] >= 1) {
    				if (if_block35) {
    					if_block35.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block35, 1);
    					}
    				} else {
    					if_block35 = create_if_block_12(ctx);
    					if_block35.c();
    					transition_in(if_block35, 1);
    					if_block35.m(svg0, if_block35_anchor);
    				}
    			} else if (if_block35) {
    				group_outros();

    				transition_out(if_block35, 1, 1, () => {
    					if_block35 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][6] >= 6) {
    				if (if_block36) {
    					if_block36.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block36, 1);
    					}
    				} else {
    					if_block36 = create_if_block_11(ctx);
    					if_block36.c();
    					transition_in(if_block36, 1);
    					if_block36.m(svg0, if_block36_anchor);
    				}
    			} else if (if_block36) {
    				group_outros();

    				transition_out(if_block36, 1, 1, () => {
    					if_block36 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][6] >= 5) {
    				if (if_block37) {
    					if_block37.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block37, 1);
    					}
    				} else {
    					if_block37 = create_if_block_10(ctx);
    					if_block37.c();
    					transition_in(if_block37, 1);
    					if_block37.m(svg0, if_block37_anchor);
    				}
    			} else if (if_block37) {
    				group_outros();

    				transition_out(if_block37, 1, 1, () => {
    					if_block37 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][6] >= 4) {
    				if (if_block38) {
    					if_block38.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block38, 1);
    					}
    				} else {
    					if_block38 = create_if_block_9(ctx);
    					if_block38.c();
    					transition_in(if_block38, 1);
    					if_block38.m(svg0, if_block38_anchor);
    				}
    			} else if (if_block38) {
    				group_outros();

    				transition_out(if_block38, 1, 1, () => {
    					if_block38 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][6] >= 3) {
    				if (if_block39) {
    					if_block39.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block39, 1);
    					}
    				} else {
    					if_block39 = create_if_block_8(ctx);
    					if_block39.c();
    					transition_in(if_block39, 1);
    					if_block39.m(svg0, if_block39_anchor);
    				}
    			} else if (if_block39) {
    				group_outros();

    				transition_out(if_block39, 1, 1, () => {
    					if_block39 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][6] >= 2) {
    				if (if_block40) {
    					if_block40.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block40, 1);
    					}
    				} else {
    					if_block40 = create_if_block_7(ctx);
    					if_block40.c();
    					transition_in(if_block40, 1);
    					if_block40.m(svg0, if_block40_anchor);
    				}
    			} else if (if_block40) {
    				group_outros();

    				transition_out(if_block40, 1, 1, () => {
    					if_block40 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][6] >= 1) {
    				if (if_block41) {
    					if_block41.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block41, 1);
    					}
    				} else {
    					if_block41 = create_if_block_6(ctx);
    					if_block41.c();
    					transition_in(if_block41, 1);
    					if_block41.m(svg0, if_block41_anchor);
    				}
    			} else if (if_block41) {
    				group_outros();

    				transition_out(if_block41, 1, 1, () => {
    					if_block41 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][7] >= 6) {
    				if (if_block42) {
    					if_block42.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block42, 1);
    					}
    				} else {
    					if_block42 = create_if_block_5(ctx);
    					if_block42.c();
    					transition_in(if_block42, 1);
    					if_block42.m(svg0, if_block42_anchor);
    				}
    			} else if (if_block42) {
    				group_outros();

    				transition_out(if_block42, 1, 1, () => {
    					if_block42 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][7] >= 5) {
    				if (if_block43) {
    					if_block43.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block43, 1);
    					}
    				} else {
    					if_block43 = create_if_block_4(ctx);
    					if_block43.c();
    					transition_in(if_block43, 1);
    					if_block43.m(svg0, if_block43_anchor);
    				}
    			} else if (if_block43) {
    				group_outros();

    				transition_out(if_block43, 1, 1, () => {
    					if_block43 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][7] >= 4) {
    				if (if_block44) {
    					if_block44.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block44, 1);
    					}
    				} else {
    					if_block44 = create_if_block_3(ctx);
    					if_block44.c();
    					transition_in(if_block44, 1);
    					if_block44.m(svg0, if_block44_anchor);
    				}
    			} else if (if_block44) {
    				group_outros();

    				transition_out(if_block44, 1, 1, () => {
    					if_block44 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][7] >= 3) {
    				if (if_block45) {
    					if_block45.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block45, 1);
    					}
    				} else {
    					if_block45 = create_if_block_2(ctx);
    					if_block45.c();
    					transition_in(if_block45, 1);
    					if_block45.m(svg0, if_block45_anchor);
    				}
    			} else if (if_block45) {
    				group_outros();

    				transition_out(if_block45, 1, 1, () => {
    					if_block45 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][7] >= 2) {
    				if (if_block46) {
    					if_block46.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block46, 1);
    					}
    				} else {
    					if_block46 = create_if_block_1(ctx);
    					if_block46.c();
    					transition_in(if_block46, 1);
    					if_block46.m(svg0, if_block46_anchor);
    				}
    			} else if (if_block46) {
    				group_outros();

    				transition_out(if_block46, 1, 1, () => {
    					if_block46 = null;
    				});

    				check_outros();
    			}

    			if (/*animatedLevels*/ ctx[0][7] >= 1) {
    				if (if_block47) {
    					if_block47.p(ctx, dirty);

    					if (dirty & /*animatedLevels*/ 1) {
    						transition_in(if_block47, 1);
    					}
    				} else {
    					if_block47 = create_if_block(ctx);
    					if_block47.c();
    					transition_in(if_block47, 1);
    					if_block47.m(svg0, defs);
    				}
    			} else if (if_block47) {
    				group_outros();

    				transition_out(if_block47, 1, 1, () => {
    					if_block47 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			transition_in(if_block3);
    			transition_in(if_block4);
    			transition_in(if_block5);
    			transition_in(if_block6);
    			transition_in(if_block7);
    			transition_in(if_block8);
    			transition_in(if_block9);
    			transition_in(if_block10);
    			transition_in(if_block11);
    			transition_in(if_block12);
    			transition_in(if_block13);
    			transition_in(if_block14);
    			transition_in(if_block15);
    			transition_in(if_block16);
    			transition_in(if_block17);
    			transition_in(if_block18);
    			transition_in(if_block19);
    			transition_in(if_block20);
    			transition_in(if_block21);
    			transition_in(if_block22);
    			transition_in(if_block23);
    			transition_in(if_block24);
    			transition_in(if_block25);
    			transition_in(if_block26);
    			transition_in(if_block27);
    			transition_in(if_block28);
    			transition_in(if_block29);
    			transition_in(if_block30);
    			transition_in(if_block31);
    			transition_in(if_block32);
    			transition_in(if_block33);
    			transition_in(if_block34);
    			transition_in(if_block35);
    			transition_in(if_block36);
    			transition_in(if_block37);
    			transition_in(if_block38);
    			transition_in(if_block39);
    			transition_in(if_block40);
    			transition_in(if_block41);
    			transition_in(if_block42);
    			transition_in(if_block43);
    			transition_in(if_block44);
    			transition_in(if_block45);
    			transition_in(if_block46);
    			transition_in(if_block47);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			transition_out(if_block3);
    			transition_out(if_block4);
    			transition_out(if_block5);
    			transition_out(if_block6);
    			transition_out(if_block7);
    			transition_out(if_block8);
    			transition_out(if_block9);
    			transition_out(if_block10);
    			transition_out(if_block11);
    			transition_out(if_block12);
    			transition_out(if_block13);
    			transition_out(if_block14);
    			transition_out(if_block15);
    			transition_out(if_block16);
    			transition_out(if_block17);
    			transition_out(if_block18);
    			transition_out(if_block19);
    			transition_out(if_block20);
    			transition_out(if_block21);
    			transition_out(if_block22);
    			transition_out(if_block23);
    			transition_out(if_block24);
    			transition_out(if_block25);
    			transition_out(if_block26);
    			transition_out(if_block27);
    			transition_out(if_block28);
    			transition_out(if_block29);
    			transition_out(if_block30);
    			transition_out(if_block31);
    			transition_out(if_block32);
    			transition_out(if_block33);
    			transition_out(if_block34);
    			transition_out(if_block35);
    			transition_out(if_block36);
    			transition_out(if_block37);
    			transition_out(if_block38);
    			transition_out(if_block39);
    			transition_out(if_block40);
    			transition_out(if_block41);
    			transition_out(if_block42);
    			transition_out(if_block43);
    			transition_out(if_block44);
    			transition_out(if_block45);
    			transition_out(if_block46);
    			transition_out(if_block47);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    			if (if_block4) if_block4.d();
    			if (if_block5) if_block5.d();
    			if (if_block6) if_block6.d();
    			if (if_block7) if_block7.d();
    			if (if_block8) if_block8.d();
    			if (if_block9) if_block9.d();
    			if (if_block10) if_block10.d();
    			if (if_block11) if_block11.d();
    			if (if_block12) if_block12.d();
    			if (if_block13) if_block13.d();
    			if (if_block14) if_block14.d();
    			if (if_block15) if_block15.d();
    			if (if_block16) if_block16.d();
    			if (if_block17) if_block17.d();
    			if (if_block18) if_block18.d();
    			if (if_block19) if_block19.d();
    			if (if_block20) if_block20.d();
    			if (if_block21) if_block21.d();
    			if (if_block22) if_block22.d();
    			if (if_block23) if_block23.d();
    			if (if_block24) if_block24.d();
    			if (if_block25) if_block25.d();
    			if (if_block26) if_block26.d();
    			if (if_block27) if_block27.d();
    			if (if_block28) if_block28.d();
    			if (if_block29) if_block29.d();
    			if (if_block30) if_block30.d();
    			if (if_block31) if_block31.d();
    			if (if_block32) if_block32.d();
    			if (if_block33) if_block33.d();
    			if (if_block34) if_block34.d();
    			if (if_block35) if_block35.d();
    			if (if_block36) if_block36.d();
    			if (if_block37) if_block37.d();
    			if (if_block38) if_block38.d();
    			if (if_block39) if_block39.d();
    			if (if_block40) if_block40.d();
    			if (if_block41) if_block41.d();
    			if (if_block42) if_block42.d();
    			if (if_block43) if_block43.d();
    			if (if_block44) if_block44.d();
    			if (if_block45) if_block45.d();
    			if (if_block46) if_block46.d();
    			if (if_block47) if_block47.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const blurDuration = 400;

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Chart', slots, []);
    	let { levels } = $$props;
    	let animatedLevels = [0, 0, 0, 0, 0, 0, 0, 0];

    	$$self.$$.on_mount.push(function () {
    		if (levels === undefined && !('levels' in $$props || $$self.$$.bound[$$self.$$.props['levels']])) {
    			console.warn("<Chart> was created without expected prop 'levels'");
    		}
    	});

    	const writable_props = ['levels'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Chart> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('levels' in $$props) $$invalidate(1, levels = $$props.levels);
    	};

    	$$self.$capture_state = () => ({
    		blur,
    		levels,
    		animatedLevels,
    		blurDuration
    	});

    	$$self.$inject_state = $$props => {
    		if ('levels' in $$props) $$invalidate(1, levels = $$props.levels);
    		if ('animatedLevels' in $$props) $$invalidate(0, animatedLevels = $$props.animatedLevels);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*levels*/ 2) {
    			{
    				setTimeout(
    					() => {
    						$$invalidate(0, animatedLevels = levels);
    					},
    					400
    				);
    			}
    		}
    	};

    	return [animatedLevels, levels];
    }

    class Chart extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { levels: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Chart",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get levels() {
    		throw new Error("<Chart>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set levels(value) {
    		throw new Error("<Chart>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\App.svelte generated by Svelte v3.52.0 */

    function create_fragment(ctx) {
    	let chart;
    	let updating_levels;
    	let current;

    	function chart_levels_binding(value) {
    		/*chart_levels_binding*/ ctx[1](value);
    	}

    	let chart_props = {};

    	if (/*levels*/ ctx[0] !== void 0) {
    		chart_props.levels = /*levels*/ ctx[0];
    	}

    	chart = new Chart({ props: chart_props, $$inline: true });
    	binding_callbacks.push(() => bind(chart, 'levels', chart_levels_binding));

    	const block = {
    		c: function create() {
    			create_component(chart.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(chart, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const chart_changes = {};

    			if (!updating_levels && dirty & /*levels*/ 1) {
    				updating_levels = true;
    				chart_changes.levels = /*levels*/ ctx[0];
    				add_flush_callback(() => updating_levels = false);
    			}

    			chart.$set(chart_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(chart.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(chart.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(chart, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function randomIntFromInterval(min, max) {
    	return Math.floor(Math.random() * (max - min + 1) + min);
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let levels;
    	fill();

    	setInterval(
    		() => {
    			clear();

    			setTimeout(
    				() => {
    					fill();
    				},
    				1000
    			);
    		},
    		2500
    	);

    	function clear() {
    		$$invalidate(0, levels = [0, 0, 0, 0, 0, 0, 0, 0]);
    	}

    	function fill() {
    		$$invalidate(0, levels = [
    			randomIntFromInterval(0, 6),
    			randomIntFromInterval(0, 6),
    			randomIntFromInterval(0, 6),
    			randomIntFromInterval(0, 6),
    			randomIntFromInterval(0, 6),
    			randomIntFromInterval(0, 6),
    			randomIntFromInterval(0, 6),
    			randomIntFromInterval(0, 6)
    		]);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function chart_levels_binding(value) {
    		levels = value;
    		$$invalidate(0, levels);
    	}

    	$$self.$capture_state = () => ({
    		Chart,
    		levels,
    		clear,
    		fill,
    		randomIntFromInterval
    	});

    	$$self.$inject_state = $$props => {
    		if ('levels' in $$props) $$invalidate(0, levels = $$props.levels);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [levels, chart_levels_binding];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    var app = new App({
    	target: document.body
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
