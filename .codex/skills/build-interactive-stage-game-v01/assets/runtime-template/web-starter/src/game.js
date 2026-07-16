(function (global) {
  'use strict';

  const Runtime = global.StoryRuntime;
  if (!Runtime) throw new Error('StoryRuntime must be loaded before game.js');

  const {
    InputManager,
    Camera,
    AudioSynth,
    StageWorld,
    CueRunner,
    clamp,
    durationSeconds,
    color
  } = Runtime;

  const SAVE_KEY = 'storyteller-stage-checkpoint-v1';
  const asArray = (value) => value == null ? [] : (Array.isArray(value) ? value : [value]);

  class StoryGame {
    constructor(options = {}) {
      this.options = options;
      this.productionUrl = options.productionUrl || 'data/production.json';
      this.production = null;
      this.productionLoadPromise = null;
      this.settings = {};
      this.state = 'loading';
      this.previousState = null;
      this.sceneIndex = -1;
      this.scene = null;
      this.flags = new Set();
      this.discoveredFacts = new Set();
      this.completedInteractions = new Map();
      this.savedPropStates = new Map();
      this.history = [];
      this.selectedTarget = null;
      this.interactionPlayback = null;
      this.transition = null;
      this.lightMotion = null;
      this.textSpeedMultiplier = 1;
      this.journalOpen = false;
      this.historyOpen = false;
      this.sceneSelectOpen = false;
      this.running = false;
      this.lastFrameTime = 0;
      this.elapsed = 0;
      this.fallbacks = [];
      this.viewport = { width: 1280, height: 720, dpr: 1 };

      this.dom = this._collectDom();
      this.initialDomText = new Map();
      Object.entries(this.dom).forEach(([key, element]) => {
        if (element && typeof element.textContent === 'string') this.initialDomText.set(key, element.textContent.trim());
      });
      this.canvas = this.dom.canvas || this._createCanvas();
      this.dom.canvas = this.canvas;
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.input = new InputManager(global);
      this.camera = new Camera();
      this.audio = new AudioSynth();
      this.world = new StageWorld();
      this.cueRunner = new CueRunner(this);
      this._frame = this._frame.bind(this);
      this._resize = this._resize.bind(this);
    }

    _collectDom() {
      const byId = (id) => document.getElementById(id);
      return {
        canvas: byId('stage-canvas'),
        titleScreen: byId('title-screen'),
        startButton: byId('start-button'),
        continueButton: byId('continue-button'),
        loadingScreen: byId('loading-screen'),
        sceneCard: byId('scene-card'),
        dialoguePanel: byId('dialogue-panel'),
        speakerName: byId('speaker-name'),
        dialogueText: byId('dialogue-text'),
        interactionPrompt: byId('interaction-prompt'),
        objectivePanel: byId('objective-panel'),
        journalPanel: byId('journal-panel'),
        journalList: byId('journal-list'),
        historyPanel: byId('history-panel'),
        historyList: byId('history-list'),
        pauseMenu: byId('pause-menu'),
        endingScreen: byId('ending-screen'),
        endingTitle: byId('ending-title'),
        endingText: byId('ending-text'),
        endingStats: byId('ending-stats'),
        sceneSelectPanel: byId('scene-select-panel'),
        sceneSelectList: byId('scene-select-list'),
        toast: byId('toast')
      };
    }

    _createCanvas() {
      const canvas = document.createElement('canvas');
      canvas.id = 'stage-canvas';
      canvas.setAttribute('aria-label', document.title || '');
      canvas.tabIndex = 0;
      const host = document.getElementById('stage') || document.getElementById('game-wrapper') || document.body;
      host.prepend(canvas);
      return canvas;
    }

    async init() {
      this._bindUi();
      this._resize();
      global.addEventListener('resize', this._resize, { passive: true });
      if (global.ResizeObserver && this.canvas.parentElement) {
        this.resizeObserver = new ResizeObserver(this._resize);
        this.resizeObserver.observe(this.canvas.parentElement);
      }
      this.running = true;
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this._frame);
      await this._loadProduction();
      return this;
    }

    _bindUi() {
      const bind = (element, handler) => {
        if (!element) return;
        element.addEventListener('click', (event) => {
          event.preventDefault();
          this.audio.unlock();
          handler(event);
        });
      };
      bind(this.dom.startButton, () => this.startNew());
      bind(this.dom.continueButton, () => this.continueGame());
      bind(document.getElementById('pause-button'), () => this.pause());
      bind(document.getElementById('resume-button') || document.querySelector('[data-action="resume"]'), () => this.resume());
      bind(document.getElementById('skip-scene-button') || document.querySelector('[data-action="skip-scene"]'), () => this.skipCurrentScene());
      bind(document.getElementById('restart-button') || document.querySelector('[data-action="restart"]'), () => this.startNew());
      bind(document.getElementById('replay-button'), () => this.startNew());
      bind(document.getElementById('scene-select-button'), () => this.openSceneSelect());
      bind(document.getElementById('pause-scene-select-button'), () => this.openSceneSelect());
      bind(document.getElementById('scene-select-close'), () => this.closeSceneSelect());
      bind(document.getElementById('advance-button'), () => this.advancePlayback());
      bind(this.dom.interactionPrompt, () => this.activateInteraction());
      bind(document.getElementById('journal-button') || document.querySelector('[data-action="journal"]'), () => this.toggleJournal());
      bind(document.getElementById('history-button') || document.querySelector('[data-action="history"]'), () => this.toggleHistory());
      bind(document.getElementById('journal-close') || document.querySelector('[data-action="close-journal"]'), () => this.toggleJournal(false));
      bind(document.getElementById('history-close') || document.querySelector('[data-action="close-history"]'), () => this.toggleHistory(false));
      const textSpeed = document.getElementById('text-speed');
      if (textSpeed) {
        textSpeed.addEventListener('change', () => {
          this.textSpeedMultiplier = textSpeed.value === 'slow' ? 0.72 : (textSpeed.value === 'fast' ? 1.45 : 1);
        });
      }
      const highContrast = document.getElementById('high-contrast');
      if (highContrast) highContrast.addEventListener('change', () => document.body.classList.toggle('high-contrast', highContrast.checked));
      this.canvas.addEventListener('pointerdown', () => {
        this.audio.unlock();
        this.canvas.focus({ preventScroll: true });
      });
      global.addEventListener('beforeunload', () => this.saveCheckpoint());
    }

    async _loadProduction() {
      if (this.production) return this.production;
      if (!this.productionLoadPromise) this.productionLoadPromise = this._performProductionLoad();
      try {
        return await this.productionLoadPromise;
      } finally {
        this.productionLoadPromise = null;
      }
    }

    async _performProductionLoad() {
      this.state = 'loading';
      this._syncStateUi();
      try {
        const response = await fetch(this.productionUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const production = await response.json();
        if (!production || typeof production !== 'object' || !production.maps || !Array.isArray(production.scenes)) {
          throw new Error('Invalid production package');
        }
        this.production = production;
        this.settings = production.settings || {};
        this.audio.setVolume(this.settings.masterVolume ?? 0.34);
        this._applyProductionUi();
        this.state = 'title';
        this._syncStateUi();
        return production;
      } catch (error) {
        this.state = 'title';
        this._syncStateUi();
        this.toast(this.ui('error', this.initialDomText.get('toast') || '') || error.message, 6000);
        console.error('[StoryGame] production load failed', error);
        return null;
      }
    }

    _applyProductionUi() {
      const meta = this.production?.meta || {};
      const title = document.getElementById('production-title') || this.dom.titleScreen?.querySelector('[data-role="title"]');
      const subtitle = document.getElementById('production-subtitle') || this.dom.titleScreen?.querySelector('[data-role="subtitle"]');
      const hudTitle = document.getElementById('hud-title');
      if (title && meta.title) title.textContent = meta.title;
      if (subtitle && (meta.subtitle || meta.sourceTitle)) subtitle.textContent = meta.subtitle || meta.sourceTitle;
      if (hudTitle && meta.title) hudTitle.textContent = meta.title;
      if (this.dom.startButton && this.ui('start')) this.dom.startButton.textContent = this.ui('start');
      if (this.dom.continueButton && this.ui('continue')) this.dom.continueButton.textContent = this.ui('continue');
      const loadingText = this.dom.loadingScreen?.querySelector('[data-role="text"], p');
      if (loadingText && this.ui('loading')) loadingText.textContent = this.ui('loading');
      this._updateContinueButton();
      this.updateJournal();
      this.updateHistory();
    }

    ui(key, fallback = '') {
      const value = this.production?.settings?.ui?.[key];
      if (typeof value === 'string') return value;
      return fallback;
    }

    _show(element, visible) {
      if (!element) return;
      element.hidden = !visible;
      element.setAttribute('aria-hidden', visible ? 'false' : 'true');
      element.classList.toggle('visible', visible);
      element.classList.toggle('is-visible', visible);
      if (visible) element.style.removeProperty('display');
      else element.style.display = 'none';
    }

    _syncStateUi() {
      document.documentElement.dataset.gameState = this.state;
      this._show(this.dom.loadingScreen, this.state === 'loading');
      this._show(this.dom.titleScreen, this.state === 'title');
      this._show(this.dom.pauseMenu, this.state === 'paused');
      this._show(this.dom.endingScreen, this.state === 'ending');
      this._show(this.dom.sceneSelectPanel, this.sceneSelectOpen);
      if (this.state !== 'exploration') this._show(this.dom.interactionPrompt, false);
      this._show(this.dom.objectivePanel, this.state === 'exploration' && Boolean(this.scene?.exploration));
      this._updateContinueButton();
    }

    _updateContinueButton() {
      if (!this.dom.continueButton) return;
      const hasSave = Boolean(this._readSave());
      this.dom.continueButton.disabled = !hasSave;
      this._show(this.dom.continueButton, hasSave || this.dom.continueButton.dataset.alwaysVisible === 'true');
    }

    _resize() {
      if (!this.canvas || !this.ctx) return;
      const parent = this.canvas.parentElement;
      const bounds = parent?.getBoundingClientRect();
      const maxWidth = Math.max(320, bounds?.width || global.innerWidth || 1280);
      const maxHeight = Math.max(260, bounds?.height || global.innerHeight || 720);
      const requestedRatio = Number(this.settings.aspectRatio) || 16 / 9;
      let width = maxWidth;
      let height = width / requestedRatio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * requestedRatio;
      }
      width = Math.max(320, Math.floor(width));
      height = Math.max(240, Math.floor(height));
      const dpr = clamp(global.devicePixelRatio || 1, 1, 2);
      this.viewport = { width, height, dpr };
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      const pixelWidth = Math.floor(width * dpr);
      const pixelHeight = Math.floor(height * dpr);
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      this.camera.setViewport(width, height);
    }

    _frame(now) {
      if (!this.running) return;
      const dt = clamp((now - this.lastFrameTime) / 1000, 0, 0.05);
      this.lastFrameTime = now;
      this.elapsed += dt;
      this._update(dt);
      this._render();
      this.input.endFrame();
      requestAnimationFrame(this._frame);
    }

    _update(dt) {
      if (this.sceneSelectOpen) {
        if (this.input.pressed('pause')) {
          this.input.consume('pause');
          this.closeSceneSelect();
        }
        return;
      }
      if (this.input.pressed('journal')) {
        this.input.consume('journal');
        this.toggleJournal();
      }
      if (this.input.pressed('history')) {
        this.input.consume('history');
        this.toggleHistory();
      }
      if (this.input.pressed('pause')) {
        this.input.consume('pause');
        if (this.journalOpen) this.toggleJournal(false);
        else if (this.historyOpen) this.toggleHistory(false);
        else if (this.state === 'paused') this.resume();
        else if (['performance', 'exploration', 'transition'].includes(this.state)) this.pause();
      }
      if (this.state === 'paused' || this.state === 'title' || this.state === 'loading') return;
      if (this.state === 'ending') {
        if (this.input.pressed('advance') && this.settings.spaceRestarts === true) {
          this.input.consume('advance');
          this.startNew();
        }
        return;
      }
      this._updateLight(dt);
      this.world.update(dt);
      if (this.state === 'performance') this.cueRunner.update(dt);
      if (this.state === 'exploration') this._updateExploration(dt);
      if (this.state === 'transition') this._updateTransition(dt);
      if (this.state === 'exploration' && this.world.player) this.camera.follow(this.world.player, 1);
      this.camera.update(dt);
    }

    _render() {
      const { width, height, dpr } = this.viewport;
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#090b11';
      ctx.fillRect(0, 0, width, height);
      if (this.scene && this.world.map) {
        this.camera.begin(ctx);
        this.world.draw(ctx, this.selectedTarget);
        this._drawResumeMarker(ctx);
        this.camera.end(ctx);
        this._drawWeather(ctx, width, height);
        this._drawLighting(ctx, width, height);
        this._drawStageFrame(ctx, width, height);
      }
      if (this.transition) {
        const half = this.transition.duration / 2;
        const alpha = this.transition.elapsed <= half
          ? clamp(this.transition.elapsed / half, 0, 1)
          : clamp((this.transition.duration - this.transition.elapsed) / half, 0, 1);
        ctx.fillStyle = `rgba(3,4,8,${alpha})`;
        ctx.fillRect(0, 0, width, height);
      }
    }

    _drawLighting(ctx, width, height) {
      const intensity = clamp(this.world.light.intensity, 0, 1);
      const darkness = clamp(0.72 - intensity * 0.62, 0.03, 0.72);
      ctx.save();
      ctx.fillStyle = this._alphaColor(this.world.light.color, darkness);
      ctx.fillRect(0, 0, width, height);
      const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.68);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,.52)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    _alphaColor(value, alpha) {
      if (typeof value !== 'string' || !value.startsWith('#')) return `rgba(10,14,24,${alpha})`;
      const raw = value.slice(1);
      const hex = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw.padEnd(6, '0').slice(0, 6);
      const number = parseInt(hex, 16);
      return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
    }

    _drawWeather(ctx, width, height) {
      const weather = String(this.scene?.worldState?.weather || this.world.map?.ambient?.weather || '').toLowerCase();
      if (!weather) return;
      ctx.save();
      if (weather.includes('fog') || weather.includes('mist')) {
        for (let i = 0; i < 4; i += 1) {
          const x = ((this.elapsed * (12 + i * 4) + i * width * 0.31) % (width + 300)) - 150;
          const gradient = ctx.createRadialGradient(x, height * (0.28 + i * 0.16), 15, x, height * (0.28 + i * 0.16), width * 0.35);
          gradient.addColorStop(0, 'rgba(205,216,216,.12)');
          gradient.addColorStop(1, 'rgba(205,216,216,0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, height);
        }
      }
      if (weather.includes('rain') || weather.includes('storm')) {
        ctx.strokeStyle = 'rgba(180,205,220,.16)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 46; i += 1) {
          const x = (i * 79 + this.elapsed * 110) % (width + 50) - 25;
          const y = (i * 47 + this.elapsed * 270) % (height + 70) - 35;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 28); ctx.stroke();
        }
      }
      ctx.restore();
    }

    _drawStageFrame(ctx, width, height) {
      ctx.save();
      const left = ctx.createLinearGradient(0, 0, Math.min(72, width * 0.08), 0);
      left.addColorStop(0, 'rgba(31,12,22,.82)'); left.addColorStop(1, 'rgba(31,12,22,0)');
      ctx.fillStyle = left; ctx.fillRect(0, 0, Math.min(72, width * 0.08), height);
      const right = ctx.createLinearGradient(width, 0, width - Math.min(72, width * 0.08), 0);
      right.addColorStop(0, 'rgba(31,12,22,.82)'); right.addColorStop(1, 'rgba(31,12,22,0)');
      ctx.fillStyle = right; ctx.fillRect(width - Math.min(72, width * 0.08), 0, Math.min(72, width * 0.08), height);
      ctx.restore();
    }

    _drawResumeMarker(ctx) {
      if (this.state !== 'exploration' || !this.canResumeExploration()) return;
      const point = this.world.resolvePoint(this.scene?.exploration?.resumeAnchor);
      if (!point) return;
      const pulse = 18 + Math.sin(this.elapsed * 4) * 4;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.strokeStyle = 'rgba(235,205,132,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -pulse - 7); ctx.lineTo(0, -pulse + 2); ctx.lineTo(8, -pulse - 7); ctx.stroke();
      ctx.restore();
    }

    async startNew() {
      this.audio.unlock();
      this.closeSceneSelect();
      if (!this.production) {
        await this._loadProduction();
        if (!this.production) return false;
      }
      this.resetSave();
      this.flags.clear();
      this.discoveredFacts.clear();
      this.completedInteractions.clear();
      this.savedPropStates.clear();
      this.history = [];
      this.updateJournal();
      this.updateHistory();
      const initialId = this.settings.initialSceneId;
      const index = initialId ? this.production.scenes.findIndex((scene) => scene.id === initialId) : 0;
      return this.jumpToScene(index >= 0 ? index : 0);
    }

    async continueGame() {
      this.audio.unlock();
      if (!this.production) {
        await this._loadProduction();
        if (!this.production) return false;
      }
      const save = this._readSave();
      if (!save) {
        this.toast(this.ui('noSave', this.initialDomText.get('toast') || ''));
        return false;
      }
      this._restoreSave(save);
      return this.jumpToScene(save.sceneIndex ?? 0, { restored: true });
    }

    jumpToScene(indexOrId, options = {}) {
      if (!this.production) return false;
      let index = typeof indexOrId === 'string'
        ? this.production.scenes.findIndex((scene) => scene.id === indexOrId)
        : Number(indexOrId);
      if (!Number.isInteger(index) || index < 0 || index >= this.production.scenes.length) return false;
      this.audio.stopAll();
      this.sceneIndex = index;
      this.scene = this.production.scenes[index];
      const chapterIndicator = document.getElementById('chapter-indicator');
      if (chapterIndicator) chapterIndicator.textContent = this.scene.kicker || this.scene.title || '';
      this.world.load(this.production, this.scene);
      this.camera.setBounds(this.world.width, this.world.height);
      this.camera.setViewport(this.viewport.width, this.viewport.height);
      this.camera.snap(this.world.player || { x: this.world.width / 2, y: this.world.height / 2 }, Number(this.scene.cameraZoom) || 1);
      this.selectedTarget = null;
      this.interactionPlayback = null;
      this.transition = null;
      this.hideDialogue();
      this.hideSceneCard();
      this._show(this.dom.endingScreen, false);
      this._show(this.dom.titleScreen, false);
      this._show(this.dom.pauseMenu, false);
      this.closeSceneSelect();
      this.setFlags(this.scene.worldState?.flags || [], false);
      this._applySavedSceneState();
      this.cueRunner.start(this.scene.cues || [], this.scene);
      this.state = 'performance';
      this.previousState = null;
      this._startAmbient();
      this.updateObjective();
      this._syncStateUi();
      if (!options.noSave) this.saveCheckpoint();
      return true;
    }

    _startAmbient() {
      for (const soundEntry of this.world.map?.ambient?.sounds || []) {
        const soundId = typeof soundEntry === 'string' ? soundEntry : soundEntry.id;
        if (String(soundId).toLowerCase().includes('wind')) this.audio.play(soundId, { volume: soundEntry.volume ?? 0.35, loop: true });
      }
    }

    pause() {
      if (!['performance', 'exploration', 'transition'].includes(this.state)) return;
      this.previousState = this.state;
      this.state = 'paused';
      this._syncStateUi();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = this.previousState || 'performance';
      this.previousState = null;
      this._syncStateUi();
    }

    completeScene() {
      if (!this.scene) return;
      const next = this.scene.nextSceneId || this.production.scenes[this.sceneIndex + 1]?.id;
      if (next) this.beginTransition(next, {});
      else this.endProduction(this.scene.ending || {});
    }

    beginTransition(sceneId, cue = {}) {
      const nextId = sceneId || this.scene?.nextSceneId || this.production.scenes[this.sceneIndex + 1]?.id;
      if (!nextId) {
        this.endProduction(cue);
        return;
      }
      this.hideDialogue();
      this._show(this.dom.interactionPrompt, false);
      this.saveCheckpoint();
      this.transition = {
        sceneId: nextId,
        duration: Math.max(0.35, durationSeconds(cue.duration, 1.25)),
        elapsed: 0
      };
      this.state = 'transition';
      this._syncStateUi();
    }

    _updateTransition(dt) {
      if (!this.transition) return;
      this.transition.elapsed += dt;
      if (this.transition.elapsed >= this.transition.duration) {
        const sceneId = this.transition.sceneId;
        this.transition = null;
        if (!this.jumpToScene(sceneId)) this.endProduction({});
      }
    }

    skipCurrentScene() {
      if (!this.scene || !['performance', 'exploration', 'paused'].includes(this.state)) return false;
      this.cueRunner.skip();
      this.interactionPlayback = null;
      this.hideDialogue();
      const next = this.scene.nextSceneId || this.production.scenes[this.sceneIndex + 1]?.id;
      if (next) this.beginTransition(next, { duration: 0.45 });
      else this.endProduction(this.scene.ending || {});
      return true;
    }

    endProduction(cue = {}) {
      this.audio.stopAll();
      this.closeSceneSelect();
      this.hideDialogue();
      this.hideSceneCard();
      this._show(this.dom.interactionPrompt, false);
      this._show(this.dom.objectivePanel, false);
      const ending = this.scene?.ending || this.production?.meta?.ending || {};
      const title = cue.title || ending.title || this.ui('ending', this.initialDomText.get('endingTitle') || '');
      const text = cue.text || ending.text || this.production?.meta?.epilogue || '';
      if (this.dom.endingTitle) this.dom.endingTitle.textContent = title;
      if (this.dom.endingText) this.dom.endingText.textContent = text;
      if (this.dom.endingStats) {
        const completedInteractions = [...this.completedInteractions.values()]
          .reduce((total, entries) => total + entries.size, 0);
        const totalInteractions = this.production.scenes.reduce(
          (total, scene) => total + (scene.exploration?.interactions?.length || 0),
          0
        );
        const stats = [
          `${this.discoveredFacts.size}/${Object.keys(this.production.facts || {}).length} 条事实`,
          `${completedInteractions}/${totalInteractions} 次互动`,
          `${this.fallbacks.length} 次演出回退`
        ];
        this.dom.endingStats.replaceChildren(...stats.map((label) => {
          const item = document.createElement('span');
          item.textContent = label;
          return item;
        }));
      }
      this.state = 'ending';
      this._syncStateUi();
      this.saveCheckpoint({ complete: true });
    }

    showSceneCard(title, subtitle = '') {
      if (!this.dom.sceneCard) return;
      const titleNode = this.dom.sceneCard.querySelector('#scene-title, [data-role="title"], .scene-title');
      const subtitleNode = this.dom.sceneCard.querySelector('#scene-subtitle, [data-role="subtitle"], .scene-subtitle');
      if (titleNode) titleNode.textContent = title || '';
      if (subtitleNode) subtitleNode.textContent = subtitle || '';
      if (!titleNode && !subtitleNode) this.dom.sceneCard.textContent = [title, subtitle].filter(Boolean).join('\n');
      this._show(this.dom.sceneCard, true);
    }

    hideSceneCard() {
      this._show(this.dom.sceneCard, false);
    }

    showDialogue(speaker, text, narration = false) {
      if (this.dom.speakerName) this.dom.speakerName.textContent = speaker || '';
      if (this.dom.dialogueText) this.dom.dialogueText.textContent = text || '';
      const sigil = document.getElementById('speaker-sigil');
      if (sigil) {
        const definition = Object.values(this.production?.actors || {}).find((actor) => actor.name === speaker);
        sigil.style.background = definition ? color(definition.color, 'transparent') : 'transparent';
        sigil.style.borderColor = definition ? color(definition.accent, '') : '';
      }
      if (this.dom.dialoguePanel) this.dom.dialoguePanel.dataset.mode = narration ? 'narration' : 'dialogue';
      this._show(this.dom.dialoguePanel, true);
    }

    hideDialogue() {
      this._show(this.dom.dialoguePanel, false);
    }

    recordHistory(speaker, text, emotion = '') {
      if (!text) return;
      this.history.push({ speaker: speaker || '', text, emotion: emotion || '', sceneId: this.scene?.id || '' });
      if (this.history.length > 240) this.history.splice(0, this.history.length - 240);
      this.updateHistory();
    }

    enterExploration() {
      this.state = 'exploration';
      this.selectedTarget = null;
      this.interactionPlayback = null;
      this.hideDialogue();
      this._show(this.dom.objectivePanel, true);
      this.updateObjective();
      this._syncStateUi();
      this.saveCheckpoint();
    }

    _updateExploration(dt) {
      if (!this.scene?.exploration) {
        this.resumeExploration();
        return;
      }
      if (this.interactionPlayback) {
        this._updateInteractionPlayback(dt);
        this._show(this.dom.interactionPrompt, false);
        return;
      }
      if (!this.journalOpen && !this.historyOpen) {
        this.world.movePlayer(this.input.axis(), dt, Number(this.settings.playerSpeed) || 190);
      }
      const completed = this._sceneCompletedSet();
      const interactions = (this.scene.exploration.interactions || []).filter((entry) => {
        if (completed.has(entry.id)) return false;
        return this._interactionRequirementsMet(entry);
      });
      this.selectedTarget = this.world.interactionTarget(interactions, Number(this.settings.interactionDistance) || 116);
      const nearResume = this.canResumeExploration() && this.world.nearAnchor(
        this.scene.exploration.resumeAnchor,
        Number(this.scene.exploration.resumeDistance) || 86,
        true
      );
      if (this.journalOpen || this.historyOpen) {
        this._show(this.dom.interactionPrompt, false);
        return;
      }
      if (this.selectedTarget) {
        this.showInteractionPrompt(this.selectedTarget.interaction.label || this.selectedTarget.entity.label || this.selectedTarget.entity.name || '');
        if (this.input.pressed('interact')) {
          this.input.consume('interact');
          this._executeInteraction(this.selectedTarget.interaction);
        }
      } else if (nearResume) {
        this.showInteractionPrompt(this.scene.exploration.resumeLabel || this.ui('continuePerformance'));
        if (this.input.pressed('interact')) {
          this.input.consume('interact');
          this.resumeExploration();
        }
      } else {
        this._show(this.dom.interactionPrompt, false);
      }
    }

    _interactionRequirementsMet(interaction) {
      const requiresFlags = asArray(interaction.requiresFlags || interaction.requiredFlags);
      const requiresFacts = asArray(interaction.requiresFacts || interaction.requiredFacts);
      const excludesFlags = asArray(interaction.excludesFlags);
      return requiresFlags.every((flag) => this.flags.has(flag))
        && requiresFacts.every((fact) => this.discoveredFacts.has(fact))
        && excludesFlags.every((flag) => !this.flags.has(flag));
    }

    _executeInteraction(interaction) {
      if (!interaction?.id) return;
      const completed = this._sceneCompletedSet();
      if (completed.has(interaction.id)) return;
      completed.add(interaction.id);
      this.completedInteractions.set(this.scene.id, completed);
      if (interaction.targetType === 'actor') {
        this.world.face(interaction.targetId, this.world.playerId);
        this.world.face(this.world.playerId, interaction.targetId);
      }
      this.revealFacts(interaction.revealFacts || interaction.factIds || []);
      this.setFlags(interaction.setFlags || interaction.flags || []);
      if (interaction.propState) this.world.setPropState(interaction.propState.propId || interaction.propState.prop, interaction.propState.state);
      for (const state of interaction.propStates || []) this.world.setPropState(state.propId || state.prop, state.state);
      this.updateObjective();
      const lines = Array.isArray(interaction.dialogue) ? interaction.dialogue : [];
      if (lines.length) {
        this.interactionPlayback = { interaction, lines, index: -1, elapsed: 0, duration: 0 };
        this._nextInteractionLine();
      } else {
        this.interactionPlayback = null;
        this.hideDialogue();
      }
      this.saveCheckpoint();
    }

    advancePlayback() {
      if (this.interactionPlayback) {
        this._nextInteractionLine();
        return true;
      }
      if (this.state === 'performance') return this.cueRunner.advance();
      return false;
    }

    activateInteraction() {
      if (this.state !== 'exploration') return false;
      if (this.interactionPlayback) {
        this._nextInteractionLine();
        return true;
      }
      if (this.selectedTarget?.interaction) {
        this._executeInteraction(this.selectedTarget.interaction);
        return true;
      }
      const exploration = this.scene?.exploration;
      if (exploration && this.canResumeExploration() && this.world.nearAnchor(
        exploration.resumeAnchor,
        Number(exploration.resumeDistance) || 86,
        true
      )) {
        this.resumeExploration();
        return true;
      }
      return false;
    }

    _nextInteractionLine() {
      const playback = this.interactionPlayback;
      if (!playback) return;
      playback.index += 1;
      if (playback.index >= playback.lines.length) {
        this.interactionPlayback = null;
        this.hideDialogue();
        return;
      }
      const line = playback.lines[playback.index] || {};
      const actorId = line.actorId || line.actor;
      const actor = this.world.actors.get(actorId);
      const speaker = line.speaker || actor?.name || this.production.actors?.[actorId]?.name || '';
      if (actor && line.emotion) actor.emotion = line.emotion;
      playback.elapsed = 0;
      playback.duration = Math.max(1.3, durationSeconds(line.duration, clamp(1.5 + String(line.text || '').length * 0.075, 2.2, 9)));
      this.showDialogue(speaker, line.text || '', !speaker);
      this.recordHistory(speaker, line.text || '', line.emotion || '');
    }

    _updateInteractionPlayback(dt) {
      const playback = this.interactionPlayback;
      if (!playback) return;
      const speed = (this.input.held('advance') ? 4 : 1) * this.textSpeedMultiplier;
      playback.elapsed += dt * speed;
      if (this.input.pressed('advance')) {
        this.input.consume('advance');
        this._nextInteractionLine();
      } else if (playback.elapsed >= playback.duration) {
        this._nextInteractionLine();
      }
    }

    canResumeExploration() {
      const exploration = this.scene?.exploration;
      if (!exploration) return true;
      const completed = this._sceneCompletedSet();
      const discoveries = completed.size;
      const min = Math.max(0, Number(exploration.minDiscoveries) || 0);
      const requiredFlags = asArray(exploration.requiredFlags);
      return discoveries >= min && requiredFlags.every((flag) => this.flags.has(flag));
    }

    resumeExploration() {
      this.interactionPlayback = null;
      this.selectedTarget = null;
      this.hideDialogue();
      this._show(this.dom.interactionPrompt, false);
      this._show(this.dom.objectivePanel, false);
      this.state = 'performance';
      this._syncStateUi();
      this.cueRunner.resumeExploration();
      this.saveCheckpoint();
    }

    showInteractionPrompt(label) {
      if (!this.dom.interactionPrompt) return;
      const template = this.ui('interactionTemplate', '[{key}] {label}');
      const key = this.settings.interactionKey || 'E';
      this.dom.interactionPrompt.textContent = template.replace('{key}', key).replace('{label}', label || this.ui('interact'));
      this._show(this.dom.interactionPrompt, true);
    }

    updateObjective() {
      if (!this.dom.objectivePanel || !this.scene?.exploration) return;
      const exploration = this.scene.exploration;
      const objectiveNode = this.dom.objectivePanel.querySelector('[data-role="objective"], #objective-text');
      const progressNode = this.dom.objectivePanel.querySelector('[data-role="progress"], #objective-progress');
      const current = this._sceneCompletedSet().size;
      const minimum = Math.max(0, Number(exploration.minDiscoveries) || 0);
      const prefix = this.ui('discoveries');
      const progress = exploration.progressTemplate
        ? exploration.progressTemplate.replace('{current}', String(current)).replace('{minimum}', String(minimum))
        : [prefix, `${current}/${minimum}`].filter(Boolean).join(' ');
      if (objectiveNode) objectiveNode.textContent = exploration.objective || '';
      if (progressNode) {
        const bar = progressNode.querySelector('span');
        if (bar) {
          const denominator = Math.max(1, minimum);
          bar.style.width = `${clamp(current / denominator, 0, 1) * 100}%`;
          progressNode.setAttribute('aria-label', progress);
          progressNode.title = progress;
        } else progressNode.textContent = progress;
      }
      if (!objectiveNode && !progressNode) this.dom.objectivePanel.textContent = [exploration.objective, progress].filter(Boolean).join('\n');
    }

    revealFacts(factIds, showToast = true) {
      let changed = false;
      let lastFact = null;
      for (const id of asArray(factIds)) {
        if (!id || this.discoveredFacts.has(id)) continue;
        this.discoveredFacts.add(id);
        changed = true;
        lastFact = this.production?.facts?.[id];
      }
      if (changed) {
        this.updateJournal();
        if (showToast && lastFact?.title) this.toast(lastFact.title);
        this.saveCheckpoint();
      }
    }

    setFlags(flags, save = true) {
      let changed = false;
      for (const flag of asArray(flags)) {
        if (!flag || this.flags.has(flag)) continue;
        this.flags.add(flag);
        changed = true;
      }
      if (changed && save) this.saveCheckpoint();
    }

    updateJournal() {
      const list = this.dom.journalList;
      if (!list) return;
      list.replaceChildren();
      for (const id of this.discoveredFacts) {
        const fact = this.production?.facts?.[id];
        if (!fact) continue;
        const item = document.createElement('li');
        item.className = 'journal-entry';
        const title = document.createElement('strong');
        title.textContent = fact.title || id;
        item.appendChild(title);
        if (fact.summary) {
          const summary = document.createElement('p');
          summary.textContent = fact.summary;
          item.appendChild(summary);
        }
        if (fact.category) item.dataset.category = fact.category;
        list.appendChild(item);
      }
    }

    updateHistory() {
      const list = this.dom.historyList;
      if (!list) return;
      list.replaceChildren();
      for (const entry of this.history.slice(-80)) {
        const item = document.createElement('li');
        item.className = 'history-entry';
        if (entry.speaker) {
          const speaker = document.createElement('strong');
          speaker.textContent = entry.speaker;
          item.appendChild(speaker);
        }
        const text = document.createElement('p');
        text.textContent = entry.text;
        item.appendChild(text);
        list.appendChild(item);
      }
      list.scrollTop = list.scrollHeight;
    }

    toggleJournal(force) {
      this.journalOpen = typeof force === 'boolean' ? force : !this.journalOpen;
      if (this.journalOpen) {
        this.historyOpen = false;
        this._show(this.dom.historyPanel, false);
        this.updateJournal();
      }
      this._show(this.dom.journalPanel, this.journalOpen);
    }

    toggleHistory(force) {
      this.historyOpen = typeof force === 'boolean' ? force : !this.historyOpen;
      if (this.historyOpen) {
        this.journalOpen = false;
        this._show(this.dom.journalPanel, false);
        this.updateHistory();
      }
      this._show(this.dom.historyPanel, this.historyOpen);
    }

    openSceneSelect() {
      if (!this.production || !this.dom.sceneSelectPanel || !this.dom.sceneSelectList) return false;
      this.dom.sceneSelectList.replaceChildren();
      this.production.scenes.forEach((scene, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary-button';
        button.textContent = `${String(index + 1).padStart(2, '0')} · ${scene.title || scene.id}`;
        button.addEventListener('click', () => {
          this.audio.unlock();
          this.closeSceneSelect();
          this.jumpToScene(index);
        });
        this.dom.sceneSelectList.appendChild(button);
      });
      this.sceneSelectOpen = true;
      this._show(this.dom.sceneSelectPanel, true);
      this.dom.sceneSelectList.querySelector('button')?.focus({ preventScroll: true });
      return true;
    }

    closeSceneSelect() {
      this.sceneSelectOpen = false;
      this._show(this.dom.sceneSelectPanel, false);
    }

    setLight(cue) {
      const presets = this.production?.settings?.lightPresets || {};
      const preset = presets[cue.preset] || {};
      const toIntensity = clamp(Number(cue.intensity ?? preset.intensity ?? this.world.light.intensity), 0, 1);
      const toColor = color(cue.color || preset.color, this.world.light.color);
      const duration = durationSeconds(cue.duration, 0);
      if (duration <= 0) {
        this.world.light.preset = cue.preset || this.world.light.preset;
        this.world.light.intensity = toIntensity;
        this.world.light.color = toColor;
        this.lightMotion = null;
        return;
      }
      this.lightMotion = {
        elapsed: 0,
        duration,
        fromIntensity: this.world.light.intensity,
        toIntensity,
        toColor,
        preset: cue.preset || this.world.light.preset
      };
    }

    _updateLight(dt) {
      if (!this.lightMotion) return;
      const motion = this.lightMotion;
      motion.elapsed += dt;
      const t = clamp(motion.elapsed / motion.duration, 0, 1);
      this.world.light.intensity = motion.fromIntensity + (motion.toIntensity - motion.fromIntensity) * t;
      if (t >= 1) {
        this.world.light.preset = motion.preset;
        this.world.light.color = motion.toColor;
        this.lightMotion = null;
      }
    }

    onWorldChanged() {
      this.saveCheckpoint();
    }

    reportCueFallback(cue, cueIndex) {
      const record = { sceneId: this.scene?.id, cueIndex, cue: cue?.type || cue?.op || cue?.action || '', time: Date.now() };
      this.fallbacks.push(record);
      if (this.fallbacks.length > 40) this.fallbacks.shift();
      console.warn('[StoryGame] cue fallback', record);
    }

    toast(message, milliseconds = 2600) {
      if (!this.dom.toast || !message) return;
      this.dom.toast.textContent = message;
      this._show(this.dom.toast, true);
      global.clearTimeout(this.toastTimer);
      this.toastTimer = global.setTimeout(() => this._show(this.dom.toast, false), milliseconds);
    }

    _sceneCompletedSet() {
      if (!this.scene?.id) return new Set();
      if (!this.completedInteractions.has(this.scene.id)) this.completedInteractions.set(this.scene.id, new Set());
      return this.completedInteractions.get(this.scene.id);
    }

    saveCheckpoint(extra = {}) {
      if (!this.production || this.sceneIndex < 0) return false;
      try {
        if (this.scene?.id && this.world.props.size) {
          const state = {};
          for (const [id, prop] of this.world.props) state[id] = { state: prop.state, visible: prop.visible };
          this.savedPropStates.set(this.scene.id, state);
        }
        const completed = {};
        for (const [sceneId, ids] of this.completedInteractions) completed[sceneId] = [...ids];
        const propStates = {};
        for (const [sceneId, states] of this.savedPropStates) propStates[sceneId] = states;
        const payload = {
          version: 1,
          productionId: this.production.meta?.id || '',
          productionVersion: this.production.version || '',
          sceneIndex: this.sceneIndex,
          sceneId: this.scene?.id || '',
          facts: [...this.discoveredFacts],
          flags: [...this.flags],
          completedInteractions: completed,
          propStates,
          history: this.history.slice(-120),
          savedAt: new Date().toISOString(),
          ...extra
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        this._updateContinueButton();
        return true;
      } catch (error) {
        console.warn('[StoryGame] checkpoint save failed', error);
        return false;
      }
    }

    _readSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const save = JSON.parse(raw);
        if (!save || typeof save !== 'object') return null;
        if (this.production?.meta?.id && save.productionId && save.productionId !== this.production.meta.id) return null;
        return save;
      } catch (_) {
        return null;
      }
    }

    _restoreSave(save) {
      this.flags = new Set(asArray(save.flags));
      this.discoveredFacts = new Set(asArray(save.facts));
      this.completedInteractions.clear();
      Object.entries(save.completedInteractions || {}).forEach(([sceneId, ids]) => this.completedInteractions.set(sceneId, new Set(asArray(ids))));
      this.savedPropStates.clear();
      Object.entries(save.propStates || {}).forEach(([sceneId, states]) => this.savedPropStates.set(sceneId, states || {}));
      this.history = Array.isArray(save.history) ? save.history.slice(-120) : [];
      this.updateJournal();
      this.updateHistory();
    }

    _applySavedSceneState() {
      const states = this.savedPropStates.get(this.scene?.id);
      if (states) {
        Object.entries(states).forEach(([propId, value]) => this.world.setPropState(propId, value));
      }
      const completed = this.completedInteractions.get(this.scene?.id);
      if (!completed?.size) return;
      const interactions = this.scene?.exploration?.interactions || [];
      for (const interaction of interactions) {
        if (!completed.has(interaction.id)) continue;
        if (interaction.propState) this.world.setPropState(interaction.propState.propId || interaction.propState.prop, interaction.propState.state);
        for (const state of interaction.propStates || []) this.world.setPropState(state.propId || state.prop, state.state);
      }
    }

    resetSave() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (_) {}
      this._updateContinueButton();
      return true;
    }

    getDebugState() {
      const actors = {};
      for (const [id, actor] of this.world.actors) {
        actors[id] = {
          x: Math.round(actor.x * 10) / 10,
          y: Math.round(actor.y * 10) / 10,
          visible: actor.visible,
          emotion: actor.emotion,
          layer: actor.layer,
          moving: Boolean(actor.move)
        };
      }
      const props = {};
      for (const [id, prop] of this.world.props) props[id] = { state: prop.state, visible: prop.visible, layer: prop.layer };
      return {
        state: this.state,
        productionId: this.production?.meta?.id || null,
        productionVersion: this.production?.version || null,
        sceneIndex: this.sceneIndex,
        sceneId: this.scene?.id || null,
        cueIndex: this.cueRunner.index,
        cue: this.cueRunner.current?.type || null,
        cueElapsed: this.cueRunner.current?.elapsed || 0,
        player: this.world.player ? { x: this.world.player.x, y: this.world.player.y, facingX: this.world.player.facingX, facingY: this.world.player.facingY } : null,
        actors,
        props,
        facts: [...this.discoveredFacts],
        flags: [...this.flags],
        discoveries: this.scene ? [...this._sceneCompletedSet()] : [],
        canResume: this.canResumeExploration(),
        selectedInteraction: this.selectedTarget?.interaction?.id || null,
        layers: Object.fromEntries(this.world.layers),
        camera: { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom },
        fallbacks: [...this.fallbacks]
      };
    }

    destroy() {
      this.running = false;
      this.input.destroy();
      this.audio.stopAll();
      global.removeEventListener('resize', this._resize);
      this.resizeObserver?.disconnect();
      global.clearTimeout(this.toastTimer);
    }
  }

  global.StoryGame = StoryGame;

  function bootstrap() {
    if (global.storyGame?.destroy) global.storyGame.destroy();
    const game = new StoryGame();
    global.storyGame = game;
    game.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})(window);
