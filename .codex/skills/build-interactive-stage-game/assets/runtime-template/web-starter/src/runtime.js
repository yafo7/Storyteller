(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const EPSILON = 0.0001;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const distance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
  const durationSeconds = (value, fallback = 0) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return number > 50 ? number / 1000 : Math.max(0, number);
  };

  function color(value, fallback = '#8f887b') {
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value)) {
      const [r = 0, g = 0, b = 0, a = 1] = value;
      return `rgba(${r}, ${g}, ${b}, ${a > 1 ? a / 255 : a})`;
    }
    if (value && typeof value === 'object') {
      return `rgba(${value.r || 0}, ${value.g || 0}, ${value.b || 0}, ${value.a ?? 1})`;
    }
    return fallback;
  }

  function roundedRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class InputManager {
    constructor(target = global) {
      this.target = target;
      this.down = new Set();
      this.justPressed = new Set();
      this.justReleased = new Set();
      this.enabled = true;
      this.actions = {
        left: ['KeyA', 'ArrowLeft'],
        right: ['KeyD', 'ArrowRight'],
        up: ['KeyW', 'ArrowUp'],
        down: ['KeyS', 'ArrowDown'],
        interact: ['KeyE'],
        advance: ['Space'],
        journal: ['Tab'],
        pause: ['Escape'],
        history: ['KeyH']
      };
      this._onDown = this._onDown.bind(this);
      this._onUp = this._onUp.bind(this);
      target.addEventListener('keydown', this._onDown, { passive: false });
      target.addEventListener('keyup', this._onUp, { passive: false });
      global.addEventListener('blur', () => this.clear());
    }

    _onDown(event) {
      if (!this.enabled) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(event.code)) {
        event.preventDefault();
      }
      if (!this.down.has(event.code) || event.repeat !== true) this.justPressed.add(event.code);
      this.down.add(event.code);
    }

    _onUp(event) {
      if (!this.enabled) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(event.code)) {
        event.preventDefault();
      }
      this.down.delete(event.code);
      this.justReleased.add(event.code);
    }

    codes(action) {
      return this.actions[action] || [action];
    }

    held(action) {
      return this.codes(action).some((code) => this.down.has(code));
    }

    pressed(action) {
      return this.codes(action).some((code) => this.justPressed.has(code));
    }

    released(action) {
      return this.codes(action).some((code) => this.justReleased.has(code));
    }

    consume(action) {
      this.codes(action).forEach((code) => this.justPressed.delete(code));
    }

    axis() {
      let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
      let y = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      return { x, y };
    }

    endFrame() {
      this.justPressed.clear();
      this.justReleased.clear();
    }

    clear() {
      this.down.clear();
      this.justPressed.clear();
      this.justReleased.clear();
    }

    destroy() {
      this.target.removeEventListener('keydown', this._onDown);
      this.target.removeEventListener('keyup', this._onUp);
    }
  }

  class Camera {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.zoom = 1;
      this.targetX = 0;
      this.targetY = 0;
      this.targetZoom = 1;
      this.worldWidth = 1280;
      this.worldHeight = 720;
      this.viewportWidth = 1280;
      this.viewportHeight = 720;
      this.focusMotion = null;
    }

    setBounds(width, height) {
      this.worldWidth = Math.max(1, Number(width) || 1280);
      this.worldHeight = Math.max(1, Number(height) || 720);
    }

    setViewport(width, height) {
      this.viewportWidth = Math.max(1, width);
      this.viewportHeight = Math.max(1, height);
    }

    snap(point, zoom = this.zoom) {
      if (!point) return;
      this.x = this.targetX = point.x;
      this.y = this.targetY = point.y;
      this.zoom = this.targetZoom = clamp(Number(zoom) || 1, 0.45, 2.5);
      this._clamp();
      this.focusMotion = null;
    }

    focus(point, zoom = this.zoom, duration = 0.8) {
      if (!point) return;
      const seconds = Math.max(0.01, durationSeconds(duration, 0.8));
      this.focusMotion = {
        elapsed: 0,
        duration: seconds,
        fromX: this.x,
        fromY: this.y,
        fromZoom: this.zoom,
        toX: point.x,
        toY: point.y,
        toZoom: clamp(Number(zoom) || this.zoom, 0.45, 2.5)
      };
      this.targetX = point.x;
      this.targetY = point.y;
      this.targetZoom = this.focusMotion.toZoom;
    }

    follow(point, zoom = this.targetZoom) {
      if (!point || this.focusMotion) return;
      this.targetX = point.x;
      this.targetY = point.y;
      this.targetZoom = clamp(Number(zoom) || 1, 0.45, 2.5);
    }

    update(dt) {
      if (this.focusMotion) {
        const motion = this.focusMotion;
        motion.elapsed += dt;
        const t = clamp(motion.elapsed / motion.duration, 0, 1);
        const eased = t * t * (3 - 2 * t);
        this.x = lerp(motion.fromX, motion.toX, eased);
        this.y = lerp(motion.fromY, motion.toY, eased);
        this.zoom = lerp(motion.fromZoom, motion.toZoom, eased);
        if (t >= 1) this.focusMotion = null;
      } else {
        const smoothing = 1 - Math.exp(-dt * 6.5);
        this.x = lerp(this.x, this.targetX, smoothing);
        this.y = lerp(this.y, this.targetY, smoothing);
        this.zoom = lerp(this.zoom, this.targetZoom, smoothing);
      }
      this._clamp();
    }

    _clamp() {
      const halfW = this.viewportWidth / (2 * this.zoom);
      const halfH = this.viewportHeight / (2 * this.zoom);
      this.x = this.worldWidth <= halfW * 2 ? this.worldWidth / 2 : clamp(this.x, halfW, this.worldWidth - halfW);
      this.y = this.worldHeight <= halfH * 2 ? this.worldHeight / 2 : clamp(this.y, halfH, this.worldHeight - halfH);
      this.targetX = this.worldWidth <= halfW * 2 ? this.worldWidth / 2 : clamp(this.targetX, halfW, this.worldWidth - halfW);
      this.targetY = this.worldHeight <= halfH * 2 ? this.worldHeight / 2 : clamp(this.targetY, halfH, this.worldHeight - halfH);
    }

    begin(ctx) {
      ctx.save();
      ctx.translate(this.viewportWidth / 2, this.viewportHeight / 2);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x, -this.y);
    }

    end(ctx) {
      ctx.restore();
    }
  }

  class AudioSynth {
    constructor() {
      this.context = null;
      this.master = null;
      this.loops = new Map();
      this.enabled = true;
    }

    unlock() {
      if (!this.enabled) return;
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.28;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    }

    setVolume(value) {
      if (this.master) this.master.gain.value = clamp(Number(value) || 0, 0, 1);
    }

    play(id, options = {}) {
      if (!id || options.action === 'stop') {
        if (id) this.stop(id);
        return;
      }
      this.unlock();
      if (!this.context || !this.master) return;
      const sound = String(id).toLowerCase();
      const volume = clamp(Number(options.volume ?? 0.7), 0, 1);
      if (sound.includes('wind')) return this._wind(id, volume, options.loop !== false);
      if (sound.includes('thunder')) return this._noise(1.8, volume, 90, 700, 0.015);
      if (sound.includes('door')) {
        this._tone(92, 0.38, volume * 0.55, 'sawtooth', -34);
        return this._noise(0.18, volume * 0.22, 120, 1100, 0.005);
      }
      if (sound.includes('piano')) {
        [220, 261.63, 329.63].forEach((frequency, index) => {
          global.setTimeout(() => this._tone(frequency, 1.6, volume * 0.35, 'triangle', -4), index * 110);
        });
        return;
      }
      if (sound.includes('chime') || sound.includes('bell')) {
        this._tone(880, 1.25, volume * 0.32, 'sine', -120);
        return this._tone(1320, 0.9, volume * 0.18, 'sine', -180);
      }
      if (sound.includes('whisper')) return this._noise(1.1, volume * 0.16, 500, 2400, 0.12);
      this._tone(196, 0.35, volume * 0.22, 'sine', 0);
    }

    stop(id) {
      const nodes = this.loops.get(id);
      if (!nodes) return;
      try {
        nodes.source.stop();
      } catch (_) {}
      try {
        nodes.gain.disconnect();
      } catch (_) {}
      this.loops.delete(id);
    }

    stopAll() {
      [...this.loops.keys()].forEach((id) => this.stop(id));
    }

    _tone(frequency, seconds, volume, waveform = 'sine', glide = 0) {
      if (!this.context || !this.master) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
      if (glide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + glide), now + seconds);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(now);
      oscillator.stop(now + seconds + 0.05);
    }

    _noise(seconds, volume, lowFrequency, highFrequency, attack = 0.01) {
      if (!this.context || !this.master) return;
      const sampleCount = Math.ceil(this.context.sampleRate * Math.max(0.05, seconds));
      const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i += 1) data[i] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = 'bandpass';
      filter.frequency.value = (lowFrequency + highFrequency) / 2;
      filter.Q.value = Math.max(0.15, filter.frequency.value / Math.max(1, highFrequency - lowFrequency));
      const now = this.context.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(this.master);
      source.start(now);
      source.stop(now + seconds + 0.05);
    }

    _wind(id, volume, loop) {
      if (this.loops.has(id)) return;
      const seconds = 3;
      const sampleCount = Math.ceil(this.context.sampleRate * seconds);
      const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < sampleCount; i += 1) {
        last = last * 0.985 + (Math.random() * 2 - 1) * 0.08;
        data[i] = last;
      }
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = loop;
      filter.type = 'lowpass';
      filter.frequency.value = 750;
      gain.gain.value = volume * 0.2;
      source.connect(filter).connect(gain).connect(this.master);
      source.start();
      if (loop) this.loops.set(id, { source, gain });
      else source.stop(this.context.currentTime + seconds);
    }
  }

  class StageWorld {
    constructor() {
      this.production = null;
      this.scene = null;
      this.map = null;
      this.width = 1280;
      this.height = 720;
      this.anchors = {};
      this.obstacles = [];
      this.props = new Map();
      this.actors = new Map();
      this.playerId = null;
      this.layers = new Map();
      this.light = { preset: 'default', intensity: 0.72, color: '#172034' };
      this.debug = false;
      this.time = 0;
    }

    load(production, scene) {
      this.production = production || {};
      this.scene = scene || {};
      this.map = this.production.maps?.[scene?.mapId] || scene?.map || {};
      this.width = Number(this.map.width) || 1280;
      this.height = Number(this.map.height) || 720;
      this.anchors = { ...(this.map.anchors || {}), ...(scene?.anchors || {}) };
      this.obstacles = (this.map.obstacles || []).map((item, index) => ({
        id: item.id || `obstacle-${index}`,
        type: item.type || 'rect',
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        w: Math.max(0, Number(item.w ?? item.width) || 0),
        h: Math.max(0, Number(item.h ?? item.height) || 0),
        radius: Math.max(0, Number(item.radius) || 0),
        color: item.color,
        label: item.label,
        layer: item.layer,
        visible: item.visible !== false,
        solid: item.solid !== false
      }));
      this.props.clear();
      for (const entry of this.map.props || []) {
        const anchor = this.resolvePoint(entry.anchor) || {};
        const prop = {
          ...entry,
          id: String(entry.id),
          x: Number(entry.x ?? anchor.x) || 0,
          y: Number(entry.y ?? anchor.y) || 0,
          w: Number(entry.w ?? entry.width) || 54,
          h: Number(entry.h ?? entry.height) || 54,
          radius: Number(entry.radius) || 25,
          state: entry.state ?? 'default',
          visible: entry.visible !== false && entry.state !== 'hidden'
        };
        this.props.set(prop.id, prop);
      }
      this.layers.clear();
      this._loadLayers(scene?.worldState?.layers);
      this.actors.clear();
      const placements = Array.isArray(scene?.actors) ? scene.actors : [];
      for (const placement of placements) this.spawnActor(placement.actorId || placement.actor || placement.id, placement.anchor || placement, placement);
      this.playerId = scene?.playerActor || this.production.settings?.playerActor || null;
      if (this.playerId && !this.actors.has(this.playerId)) {
        this.spawnActor(this.playerId, this.map.spawn || { x: this.width / 2, y: this.height / 2 }, { visible: true });
      }
      const player = this.player;
      if (player) {
        player.isPlayer = true;
        player.visible = true;
        player.radius = Number(this.production.settings?.playerRadius) || player.radius || 18;
      }
      const worldLight = scene?.worldState?.light;
      if (typeof worldLight === 'number') this.light.intensity = clamp(worldLight, 0, 1);
      else if (worldLight && typeof worldLight === 'object') {
        this.light = {
          preset: worldLight.preset || 'default',
          intensity: clamp(Number(worldLight.intensity ?? 0.72), 0, 1),
          color: color(worldLight.color, '#172034')
        };
      } else {
        this.light = {
          preset: String(worldLight || this.map.ambient?.light || 'default'),
          intensity: clamp(Number(this.map.ambient?.intensity ?? 0.72), 0, 1),
          color: color(this.map.ambient?.color, '#172034')
        };
      }
      this.time = 0;
    }

    _loadLayers(rawLayers) {
      if (Array.isArray(rawLayers)) {
        rawLayers.forEach((layer) => {
          if (typeof layer === 'string') this.layers.set(layer, 1);
          else if (layer?.id) this.layers.set(layer.id, layer.visible === false ? 0 : Number(layer.opacity ?? 1));
        });
      } else if (rawLayers && typeof rawLayers === 'object') {
        Object.entries(rawLayers).forEach(([id, value]) => {
          if (typeof value === 'boolean') this.layers.set(id, value ? 1 : 0);
          else if (typeof value === 'number') this.layers.set(id, clamp(value, 0, 1));
          else this.layers.set(id, value?.visible === false ? 0 : clamp(Number(value?.opacity ?? 1), 0, 1));
        });
      }
      this.layers.set('default', this.layers.get('default') ?? 1);
    }

    get player() {
      return this.actors.get(this.playerId) || null;
    }

    resolvePoint(reference) {
      if (!reference) return null;
      if (typeof reference === 'string') {
        const anchor = this.anchors[reference];
        return anchor ? { x: Number(anchor.x) || 0, y: Number(anchor.y) || 0 } : null;
      }
      if (typeof reference === 'object' && Number.isFinite(Number(reference.x)) && Number.isFinite(Number(reference.y))) {
        return { x: Number(reference.x), y: Number(reference.y) };
      }
      return null;
    }

    entityPoint(reference) {
      if (!reference) return null;
      if (typeof reference === 'string') {
        const actor = this.actors.get(reference);
        if (actor) return { x: actor.x, y: actor.y };
        const prop = this.props.get(reference);
        if (prop) return { x: prop.x, y: prop.y };
      }
      return this.resolvePoint(reference);
    }

    layerOpacity(layer) {
      if (!layer) return 1;
      return clamp(this.layers.get(layer) ?? 1, 0, 1);
    }

    setLayer(id, visible = true, opacity = 1) {
      if (!id) return;
      this.layers.set(id, visible === false ? 0 : clamp(Number(opacity ?? 1), 0, 1));
    }

    spawnActor(actorId, anchorReference, overrides = {}) {
      if (!actorId) return null;
      const definition = this.production?.actors?.[actorId] || {};
      const anchor = this.resolvePoint(anchorReference) || this.resolvePoint(overrides.anchor) || this.map?.spawn || { x: this.width / 2, y: this.height / 2 };
      const existing = this.actors.get(actorId);
      const actor = existing || {
        id: actorId,
        x: Number(anchor.x) || 0,
        y: Number(anchor.y) || 0,
        facingX: 0,
        facingY: 1,
        radius: Number(definition.radius) || 19,
        move: null,
        emotion: 'neutral',
        alpha: 1
      };
      Object.assign(actor, definition, overrides, {
        id: actorId,
        name: overrides.name || definition.name || actorId,
        color: color(overrides.color || definition.color, '#7e7780'),
        accent: color(overrides.accent || definition.accent, '#d1b786'),
        layer: overrides.layer || definition.layer || 'default',
        shape: overrides.shape || definition.shape || 'actor',
        visible: overrides.visible !== false
      });
      actor.x = Number(anchor.x) || 0;
      actor.y = Number(anchor.y) || 0;
      actor.move = null;
      this.actors.set(actorId, actor);
      return actor;
    }

    despawnActor(actorId) {
      const actor = this.actors.get(actorId);
      if (!actor) return;
      actor.visible = false;
      actor.move = null;
    }

    beginMove(actorId, targetReference, speed = 110) {
      const actor = this.actors.get(actorId);
      const target = this.resolvePoint(targetReference) || this.entityPoint(targetReference);
      if (!actor || !target) return false;
      actor.visible = true;
      actor.move = {
        x: target.x,
        y: target.y,
        speed: Math.max(10, Number(speed) || 110)
      };
      return true;
    }

    finishMove(actorId, targetReference) {
      const actor = this.actors.get(actorId);
      const target = this.resolvePoint(targetReference) || this.entityPoint(targetReference);
      if (!actor || !target) return;
      actor.x = target.x;
      actor.y = target.y;
      actor.move = null;
    }

    face(actorId, targetReference) {
      const actor = this.actors.get(actorId);
      const target = this.entityPoint(targetReference) || this.resolvePoint(targetReference);
      if (!actor || !target) return;
      const dx = target.x - actor.x;
      const dy = target.y - actor.y;
      const length = Math.hypot(dx, dy) || 1;
      actor.facingX = dx / length;
      actor.facingY = dy / length;
    }

    setPropState(propId, state) {
      const prop = this.props.get(propId);
      if (!prop) return;
      if (state && typeof state === 'object') {
        Object.assign(prop, state);
        if (state.state === 'hidden') prop.visible = false;
        else if (state.state && state.visible == null) prop.visible = true;
      } else {
        prop.state = state;
        if (state === 'hidden') prop.visible = false;
        else if (state != null) prop.visible = true;
      }
    }

    update(dt) {
      this.time += dt;
      for (const actor of this.actors.values()) {
        if (!actor.visible || !actor.move) continue;
        const dx = actor.move.x - actor.x;
        const dy = actor.move.y - actor.y;
        const remaining = Math.hypot(dx, dy);
        const step = actor.move.speed * dt;
        if (remaining <= step + EPSILON) {
          actor.x = actor.move.x;
          actor.y = actor.move.y;
          actor.move = null;
        } else {
          actor.facingX = dx / remaining;
          actor.facingY = dy / remaining;
          actor.x += actor.facingX * step;
          actor.y += actor.facingY * step;
        }
      }
    }

    movePlayer(axis, dt, speed = 170) {
      const player = this.player;
      if (!player) return;
      if (Math.abs(axis.x) + Math.abs(axis.y) > EPSILON) {
        player.facingX = axis.x;
        player.facingY = axis.y;
      }
      const amount = Math.max(0, Number(speed) || 170) * dt;
      this._tryPlayerPosition(player, player.x + axis.x * amount, player.y);
      this._tryPlayerPosition(player, player.x, player.y + axis.y * amount);
    }

    _tryPlayerPosition(player, x, y) {
      const radius = player.radius || 18;
      const candidate = {
        x: clamp(x, radius, this.width - radius),
        y: clamp(y, radius, this.height - radius)
      };
      if (!this.collides(candidate.x, candidate.y, radius)) {
        player.x = candidate.x;
        player.y = candidate.y;
      }
    }

    collides(x, y, radius) {
      for (const item of this.obstacles) {
        if (!item.visible || !item.solid || this.layerOpacity(item.layer) <= 0.02) continue;
        if (item.type === 'circle' || item.radius > 0) {
          if (Math.hypot(x - item.x, y - item.y) < radius + item.radius) return true;
        } else {
          const nearestX = clamp(x, item.x, item.x + item.w);
          const nearestY = clamp(y, item.y, item.y + item.h);
          if ((x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2) return true;
        }
      }
      for (const prop of this.props.values()) {
        if (!prop.visible || !prop.solid || this.layerOpacity(prop.layer) <= 0.02) continue;
        if (Math.hypot(x - prop.x, y - prop.y) < radius + (prop.radius || 24)) return true;
      }
      return false;
    }

    interactionTarget(interactions, maxDistance = 112) {
      const player = this.player;
      if (!player) return null;
      let best = null;
      for (const interaction of interactions || []) {
        let entity = null;
        if (interaction.targetType === 'actor') entity = this.actors.get(interaction.targetId);
        if (interaction.targetType === 'prop') entity = this.props.get(interaction.targetId);
        if (!entity || entity.visible === false || this.layerOpacity(entity.layer) <= 0.05) continue;
        const dx = entity.x - player.x;
        const dy = entity.y - player.y;
        const dist = Math.hypot(dx, dy);
        const allowed = Number(interaction.distance) || maxDistance;
        if (dist > allowed) continue;
        const dot = dist < 1 ? 1 : (dx / dist) * player.facingX + (dy / dist) * player.facingY;
        if (dot < -0.15 && dist > 42) continue;
        const score = dist / allowed + (1 - dot) * 0.34;
        if (!best || score < best.score) best = { interaction, entity, distance: dist, dot, score };
      }
      return best;
    }

    nearAnchor(anchorId, maxDistance = 82, requireFacing = false) {
      const player = this.player;
      const anchor = this.resolvePoint(anchorId);
      if (!player || !anchor) return false;
      const dx = anchor.x - player.x;
      const dy = anchor.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDistance) return false;
      if (!requireFacing || dist < 34) return true;
      const dot = (dx / (dist || 1)) * player.facingX + (dy / (dist || 1)) * player.facingY;
      return dot > -0.05;
    }

    draw(ctx, selectedTarget = null) {
      const ambient = this.map?.ambient || {};
      ctx.fillStyle = color(this.map?.background || ambient.color, '#191c24');
      ctx.fillRect(0, 0, this.width, this.height);
      this._drawFloor(ctx);
      for (const obstacle of this.obstacles) this._drawObstacle(ctx, obstacle);
      const drawables = [];
      for (const prop of this.props.values()) drawables.push({ kind: 'prop', value: prop, y: prop.y });
      for (const actor of this.actors.values()) drawables.push({ kind: 'actor', value: actor, y: actor.y });
      drawables.sort((a, b) => a.y - b.y);
      for (const drawable of drawables) {
        if (drawable.kind === 'prop') this._drawProp(ctx, drawable.value, selectedTarget?.entity === drawable.value);
        else this._drawActor(ctx, drawable.value, selectedTarget?.entity === drawable.value);
      }
      if (this.debug) this._drawDebug(ctx);
    }

    _drawFloor(ctx) {
      const grid = Number(this.map?.gridSize) || 64;
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = color(this.map?.gridColor, '#d8c9a6');
      ctx.lineWidth = 1;
      for (let x = 0; x <= this.width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      for (let y = 0; y <= this.height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawObstacle(ctx, item) {
      const opacity = this.layerOpacity(item.layer);
      if (!item.visible || opacity <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color(item.color, '#37343a');
      ctx.strokeStyle = 'rgba(227, 210, 177, .16)';
      ctx.lineWidth = 2;
      if (item.type === 'circle' || item.radius > 0) {
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius, 0, TAU);
        ctx.fill();
        ctx.stroke();
      } else {
        roundedRect(ctx, item.x, item.y, item.w, item.h, Math.min(10, item.w / 6, item.h / 6));
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawProp(ctx, prop, selected) {
      const opacity = this.layerOpacity(prop.layer);
      if (!prop.visible || opacity <= 0.01) return;
      const pulse = selected ? 1 + Math.sin(this.time * 6) * 0.08 : 1;
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = opacity * Number(prop.opacity ?? 1);
      const base = color(prop.color, '#786b58');
      const accent = color(prop.accent, '#c7ad7c');
      const type = String(prop.type || '').toLowerCase();
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.strokeStyle = selected ? '#e8d39d' : 'rgba(235,220,188,.34)';
      ctx.fillStyle = base;
      if (type.includes('door')) {
        roundedRect(ctx, -24, -42, 48, 84, 4);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(14, 2, 3.5, 0, TAU); ctx.fill();
      } else if (type.includes('piano')) {
        roundedRect(ctx, -38, -25, 76, 50, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d9d2bf'; ctx.fillRect(-30, 10, 60, 9);
        ctx.strokeStyle = '#333';
        for (let x = -25; x < 28; x += 8) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 19); ctx.stroke(); }
      } else if (type.includes('curtain')) {
        ctx.beginPath();
        ctx.moveTo(-25, -38); ctx.quadraticCurveTo(-10, -20, -20, 40);
        ctx.lineTo(20, 40); ctx.quadraticCurveTo(10, -20, 25, -38); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (type.includes('grave')) {
        ctx.beginPath(); ctx.moveTo(-22, 34); ctx.lineTo(-20, -16); ctx.arc(0, -16, 20, Math.PI, 0); ctx.lineTo(22, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = accent; ctx.fillRect(-2, -22, 4, 30); ctx.fillRect(-10, -14, 20, 4);
      } else if (type.includes('photo') || type.includes('letter') || type.includes('book') || type.includes('bible')) {
        roundedRect(ctx, -24, -18, 48, 36, 3); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = accent; ctx.beginPath(); ctx.moveTo(-13, -7); ctx.lineTo(13, -7); ctx.moveTo(-13, 0); ctx.lineTo(9, 0); ctx.moveTo(-13, 7); ctx.lineTo(14, 7); ctx.stroke();
      } else if (type.includes('lamp') || type.includes('candle')) {
        ctx.fillRect(-5, -4, 10, 35); ctx.strokeRect(-5, -4, 10, 35);
        const glow = ctx.createRadialGradient(0, -12, 1, 0, -12, 26);
        glow.addColorStop(0, 'rgba(255,225,140,.8)'); glow.addColorStop(1, 'rgba(255,210,100,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -12, 26, 0, TAU); ctx.fill();
      } else if (type.includes('table')) {
        ctx.beginPath(); ctx.ellipse(0, 0, prop.w / 2, prop.h / 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
      } else {
        roundedRect(ctx, -prop.w / 2, -prop.h / 2, prop.w, prop.h, 7); ctx.fill(); ctx.stroke();
      }
      if (selected) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#f2d88b';
        ctx.beginPath(); ctx.arc(0, 0, Math.max(prop.w, prop.h) * 0.65, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }

    _drawActor(ctx, actor, selected) {
      const layerAlpha = this.layerOpacity(actor.layer);
      if (!actor.visible || layerAlpha <= 0.01) return;
      const spectral = /spirit|ghost|dead|living/i.test(actor.layer || '');
      const bob = Math.sin(this.time * 2.4 + actor.x * 0.01) * (spectral ? 2.5 : 0.8);
      ctx.save();
      ctx.translate(actor.x, actor.y + bob);
      ctx.globalAlpha = layerAlpha * Number(actor.alpha ?? 1) * (spectral ? 0.78 : 1);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(0, 18, 22, 8, 0, 0, TAU); ctx.fill();
      if (spectral) {
        const glow = ctx.createRadialGradient(0, -12, 2, 0, -12, 44);
        glow.addColorStop(0, 'rgba(170,220,240,.28)'); glow.addColorStop(1, 'rgba(120,190,225,0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -10, 44, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = actor.color;
      ctx.strokeStyle = selected || actor.isPlayer ? actor.accent : 'rgba(235,225,205,.32)';
      ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(-16, 20); ctx.quadraticCurveTo(-14, -5, -11, -13); ctx.quadraticCurveTo(0, -21, 11, -13); ctx.quadraticCurveTo(14, -5, 16, 20); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = actor.accent;
      ctx.beginPath(); ctx.arc(0, -23, 11, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,20,26,.72)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(actor.facingX * 3 - 2, -24 + actor.facingY * 2); ctx.lineTo(actor.facingX * 3 + 2, -24 + actor.facingY * 2); ctx.stroke();
      if (actor.emotion && actor.emotion !== 'neutral') {
        ctx.fillStyle = 'rgba(12,14,20,.78)';
        ctx.beginPath(); ctx.arc(18, -36, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = actor.accent; ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this._emotionMark(actor.emotion), 18, -36);
      }
      if (selected || actor.isPlayer || actor.showName) {
        ctx.font = '12px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const width = ctx.measureText(actor.name).width + 16;
        ctx.fillStyle = 'rgba(8,9,14,.72)'; roundedRect(ctx, -width / 2, 27, width, 22, 8); ctx.fill();
        ctx.fillStyle = '#e5ddca'; ctx.fillText(actor.name, 0, 45);
      }
      ctx.restore();
    }

    _emotionMark(emotion) {
      const value = String(emotion).toLowerCase();
      if (/fear|afraid|panic/.test(value)) return '!';
      if (/angry|rage/.test(value)) return '×';
      if (/sad|grief/.test(value)) return '·';
      if (/surprise|shock/.test(value)) return '?';
      if (/whisper|secret/.test(value)) return '…';
      return '•';
    }

    _drawDebug(ctx) {
      ctx.save();
      ctx.font = '11px monospace';
      Object.entries(this.anchors).forEach(([id, anchor]) => {
        ctx.strokeStyle = '#75e4ff'; ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 7, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#75e4ff'; ctx.fillText(id, anchor.x + 10, anchor.y - 8);
      });
      ctx.restore();
    }
  }

  class CueRunner {
    constructor(game) {
      this.game = game;
      this.cues = [];
      this.index = 0;
      this.current = null;
      this.scene = null;
      this.active = false;
      this.suspended = false;
    }

    start(cues, scene) {
      this.cues = Array.isArray(cues) ? cues : [];
      this.index = 0;
      this.current = null;
      this.scene = scene;
      this.active = true;
      this.suspended = false;
    }

    update(dt) {
      if (!this.active || this.suspended) return;
      let guard = 0;
      while (this.active && !this.suspended && !this.current && this.index < this.cues.length && guard < 40) {
        this._begin(this.cues[this.index]);
        guard += 1;
      }
      if (!this.active || this.suspended) return;
      if (!this.current && this.index >= this.cues.length) {
        this.active = false;
        this.game.completeScene();
        return;
      }
      if (!this.current) return;
      const action = this.current;
      const advancePressed = this.game.input.pressed('advance');
      const textRate = ['title', 'narrate', 'say', 'wait'].includes(action.type)
        ? (Number(this.game.textSpeedMultiplier) || 1)
        : 1;
      const multiplier = (this.game.input.held('advance') ? 4 : 1) * textRate;
      action.elapsed += dt * multiplier;
      action.realElapsed += dt;
      if (advancePressed && ['title', 'narrate', 'say', 'wait'].includes(action.type)) {
        this.game.input.consume('advance');
        this._finish();
        return;
      }
      if (action.type === 'move') {
        if (!this.game.world.actors.get(action.cue.actorId || action.cue.actor)?.move) this._finish();
      } else if (action.type === 'camera') {
        if (!this.game.camera.focusMotion || action.elapsed >= action.duration) this._finish();
      } else if (action.type === 'layer') {
        const t = clamp(action.elapsed / action.duration, 0, 1);
        this.game.world.setLayer(action.layerId, true, lerp(action.fromOpacity, action.toOpacity, t));
        if (t >= 1) {
          if (action.cue.visible === false) this.game.world.setLayer(action.layerId, false, 0);
          this._finish();
        }
      } else if (action.elapsed >= action.duration) {
        this._finish();
      }
      if (this.current && action.realElapsed >= action.timeout) this._fallback(action);
    }

    _begin(rawCue) {
      const cue = rawCue || {};
      const type = String(cue.type || cue.op || cue.action || '').toLowerCase();
      const defaultDuration = this._defaultDuration(type, cue);
      const action = {
        cue,
        type,
        elapsed: 0,
        realElapsed: 0,
        duration: Math.max(0.01, durationSeconds(cue.duration, defaultDuration)),
        timeout: Math.max(0.25, durationSeconds(cue.timeout, Math.max(defaultDuration + 3, 8)))
      };
      this.current = action;
      switch (type) {
        case 'title':
          this.game.showSceneCard(cue.text || cue.title || this.scene?.title, cue.subtitle || this.scene?.subtitle);
          break;
        case 'narrate':
          this.game.showDialogue('', cue.text || '', true);
          this.game.recordHistory('', cue.text || '', 'narration');
          break;
        case 'say': {
          const actorId = cue.actorId || cue.actor;
          const actor = this.game.world.actors.get(actorId);
          if (actor && cue.emotion) actor.emotion = cue.emotion;
          const speaker = cue.speaker || actor?.name || this.game.production?.actors?.[actorId]?.name || '';
          this.game.showDialogue(speaker, cue.text || '', false);
          this.game.recordHistory(speaker, cue.text || '', cue.emotion);
          break;
        }
        case 'move': {
          const target = cue.anchor || cue.targetAnchor || cue.target;
          const actorId = cue.actorId || cue.actor;
          const actor = this.game.world.actors.get(actorId);
          const point = this.game.world.resolvePoint(target);
          const dist = actor && point ? distance(actor, point) : 0;
          const speed = Number(cue.speed) || 110;
          action.duration = Math.max(0.08, dist / speed);
          action.timeout = Math.max(action.timeout, action.duration + 2.5);
          action.target = target;
          if (!this.game.world.beginMove(actorId, target, speed)) return this._finish();
          break;
        }
        case 'face':
          this.game.world.face(cue.actorId || cue.actor, cue.targetActorId || cue.targetActor || cue.targetAnchor || cue.target);
          return this._finish();
        case 'wait':
          break;
        case 'prop':
          this.game.world.setPropState(cue.propId || cue.prop || cue.id, cue.state ?? cue.value);
          this.game.onWorldChanged();
          if (!cue.duration) return this._finish();
          break;
        case 'light':
          this.game.setLight(cue);
          if (!cue.duration) return this._finish();
          break;
        case 'sound':
          this.game.audio.play(cue.soundId || cue.id, cue);
          return this._finish();
        case 'reveal':
          this.game.revealFacts(cue.factIds || cue.facts || []);
          this.game.setFlags(cue.setFlags || cue.flags || []);
          return this._finish();
        case 'spawn':
          this.game.world.spawnActor(cue.actorId || cue.actor, cue.anchor || cue.targetAnchor, { visible: true, emotion: cue.emotion });
          return this._finish();
        case 'despawn':
          this.game.world.despawnActor(cue.actorId || cue.actor);
          return this._finish();
        case 'camera': {
          const point = this.game.world.entityPoint(cue.targetActorId || cue.targetActor || cue.targetAnchor || cue.target) || this.game.world.player;
          this.game.camera.focus(point, cue.zoom || this.game.camera.zoom, action.duration);
          break;
        }
        case 'layer': {
          action.layerId = cue.layerId || cue.id;
          action.fromOpacity = this.game.world.layerOpacity(action.layerId);
          action.toOpacity = cue.visible === false ? 0 : clamp(Number(cue.opacity ?? 1), 0, 1);
          if (!cue.duration) {
            this.game.world.setLayer(action.layerId, cue.visible !== false, action.toOpacity);
            return this._finish();
          }
          break;
        }
        case 'explore':
          this.suspended = true;
          this.game.enterExploration(cue);
          break;
        case 'transition':
          this.suspended = true;
          this.game.beginTransition(cue.sceneId || cue.targetSceneId, cue);
          break;
        case 'end':
          this.active = false;
          this.current = null;
          this.game.endProduction(cue);
          break;
        default:
          return this._finish();
      }
    }

    _defaultDuration(type, cue) {
      if (type === 'title') return 2.8;
      if (type === 'narrate' || type === 'say') {
        return clamp(1.5 + String(cue.text || '').length * 0.075, 2.2, 9);
      }
      if (type === 'wait') return 1;
      if (type === 'camera' || type === 'layer' || type === 'light') return 0.8;
      return 0.02;
    }

    _finish() {
      if (!this.current) return;
      const type = this.current.type;
      if (type === 'title') this.game.hideSceneCard();
      if (type === 'narrate' || type === 'say') this.game.hideDialogue();
      this.current = null;
      this.index += 1;
    }

    _fallback(action) {
      const cue = action.cue;
      if (action.type === 'move') this.game.world.finishMove(cue.actorId || cue.actor, action.target);
      if (action.type === 'camera') {
        const point = this.game.world.entityPoint(cue.targetActorId || cue.targetActor || cue.targetAnchor || cue.target) || this.game.world.player;
        this.game.camera.snap(point, cue.zoom || this.game.camera.zoom);
      }
      if (action.type === 'layer') this.game.world.setLayer(action.layerId, cue.visible !== false, action.toOpacity);
      this.game.reportCueFallback?.(cue, this.index);
      this._finish();
    }

    resumeExploration() {
      if (!this.current || this.current.type !== 'explore') return;
      this.suspended = false;
      this._finish();
    }

    advance() {
      if (!this.current || !['title', 'narrate', 'say', 'wait'].includes(this.current.type)) return false;
      this._finish();
      return true;
    }

    skip() {
      const start = this.current ? this.index : Math.max(0, this.index);
      for (let i = start; i < this.cues.length; i += 1) this._applyNecessaryEffects(this.cues[i]);
      const effects = this.scene?.skipEffects || {};
      this.game.revealFacts(effects.revealFacts || effects.factIds || []);
      this.game.setFlags(effects.setFlags || effects.flags || []);
      for (const propState of effects.propStates || []) this.game.world.setPropState(propState.propId, propState.state);
      const exploration = this.scene?.exploration;
      if (exploration) {
        this.game.setFlags(exploration.requiredFlags || []);
        for (const interaction of exploration.interactions || []) {
          this.game.revealFacts(interaction.revealFacts || []);
          this.game.setFlags(interaction.setFlags || []);
          if (interaction.propState) this.game.world.setPropState(interaction.propState.propId, interaction.propState.state);
        }
      }
      this.active = false;
      this.current = null;
      this.suspended = false;
    }

    _applyNecessaryEffects(cue) {
      if (!cue) return;
      const type = String(cue.type || cue.op || cue.action || '').toLowerCase();
      if (type === 'reveal') {
        this.game.revealFacts(cue.factIds || cue.facts || []);
        this.game.setFlags(cue.setFlags || cue.flags || []);
      } else if (type === 'prop') this.game.world.setPropState(cue.propId || cue.prop || cue.id, cue.state ?? cue.value);
      else if (type === 'spawn') this.game.world.spawnActor(cue.actorId || cue.actor, cue.anchor || cue.targetAnchor, { visible: true });
      else if (type === 'despawn') this.game.world.despawnActor(cue.actorId || cue.actor);
      else if (type === 'layer') this.game.world.setLayer(cue.layerId || cue.id, cue.visible !== false, cue.opacity ?? 1);
    }
  }

  global.StoryRuntime = {
    InputManager,
    Camera,
    AudioSynth,
    StageWorld,
    CueRunner,
    clamp,
    lerp,
    distance,
    durationSeconds,
    color
  };
})(window);
