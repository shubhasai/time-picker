/**
 * Time Theory — Minimal Full-Screen Box-Free Controller.
 * Manages Temporal Plain date/time state, 2-POV toggle ('space' <-> 'earth'),
 * box-free plain text readout, 3D Earth country selection, and keyboard rotation.
 */
import { ThreeGearMachine } from './three-machine.js?v=13';
import {
  COUNTRY_TIMEZONES,
  detectLocalTimezone,
  formatOffsetLabel,
  formatMeridianLabel,
  computeCelestialState,
  computeWeatherCondition
} from './astronomy.js';

const tm = window.NeonCalibre.TemporalModel;

const GEAR_LABELS = {
  year: 'YEAR',
  month: 'MONTH',
  day: 'DAY',
  hour: 'HOUR',
  minute: 'MINUTE',
  ampm: 'MERIDIAN'
};

function mod(n, m) {
  return ((n % m) + m) % m;
}

class FullScreenOrreryApp {
  constructor() {
    const initial = tm.now();
    const localTz = detectLocalTimezone();

    this.state = {
      year: initial.year,
      month: initial.month,
      day: initial.day,
      hour: initial.hour,
      minute: initial.minute,
      is24h: false,
      engagedGearId: 'year',
      povMode: 'space',
      earthStep: 'room',
      countryId: localTz.matchedId || 'local',
      countryName: localTz.country,
      tzOffsetHours: localTz.offsetHours,
      observerLatDeg: localTz.latDeg,
      observerLonDeg: localTz.lonDeg,
      tzLabel: `${localTz.country} (${formatOffsetLabel(localTz.offsetHours)})`,
      isSaved: true
    };

    this.lastSteps = {
      year: this.state.year,
      month: this.state.month - 1,
      day: this.state.day - 1,
      hour: this.state.hour % 12,
      ampm: this.state.hour >= 12 ? 1 : 0,
      minute: this.state.minute
    };

    this._announceTimer = null;
    this._copyFeedbackTimer = null;
    this._scopeNotice = '';
    this._scopeNoticeTimer = null;
    this._skySummaryText = '';
    this.state.telescopeTarget = null;
    this._lastClusterGear = { date: 'year', time: 'hour' };

    this.dom = {
      pickerView: document.getElementById('picker-view'),
      savedView: document.getElementById('saved-view'),
      savedEyebrow: document.getElementById('saved-eyebrow'),
      savedPrimary: document.getElementById('saved-primary'),
      savedSky: document.getElementById('saved-sky'),
      savedCopyIso: document.getElementById('saved-copy-iso'),
      btnEdit: document.getElementById('btn-edit'),
      canvas: document.getElementById('gear-3d-canvas'),
      telescopeOverlay: document.getElementById('telescope-overlay'),
      telescopeHudInfo: document.getElementById('telescope-hud-info'),
      telescopeTargets: document.getElementById('telescope-targets'),
      btnScopeSun: document.getElementById('btn-scope-sun'),
      btnScopeMoon: document.getElementById('btn-scope-moon'),
      readoutPrimary: document.getElementById('readout-primary'),
      readoutSky: document.getElementById('readout-sky'),
      btnCopyIso: document.getElementById('btn-copy-iso'),
      activeGearText: document.getElementById('active-gear-text'),
      tzSelect: document.getElementById('tz-select'),
      btnFormatToggle: document.getElementById('btn-format-toggle'),
      btnNow: document.getElementById('btn-now'),
      btnPovSpace: document.getElementById('btn-pov-space'),
      btnPovEarth: document.getElementById('btn-pov-earth'),
      earthStepNav: document.getElementById('earth-step-nav'),
      btnEarthRoom: document.getElementById('btn-earth-room'),
      btnEarthRemote: document.getElementById('btn-earth-remote'),
      btnEarthTelescope: document.getElementById('btn-earth-telescope'),
      btnEarthDone: document.getElementById('btn-earth-done'),
      btnZoomOut: document.getElementById('btn-zoom-out'),
      btnZoomReset: document.getElementById('btn-zoom-reset'),
      btnZoomIn: document.getElementById('btn-zoom-in'),
      btnSave: document.getElementById('btn-save'),
      bottomHint: document.getElementById('bottom-hint'),
      btnClusterDate: document.getElementById('btn-cluster-date'),
      btnClusterTime: document.getElementById('btn-cluster-time'),
      btnAxisCcw: document.getElementById('btn-axis-ccw'),
      btnAxisScrub: document.getElementById('btn-axis-scrub'),
      btnAxisCw: document.getElementById('btn-axis-cw'),
      mobileGearsDate: document.getElementById('mobile-gears-date'),
      mobileGearsTime: document.getElementById('mobile-gears-time'),
      btnGearPrev: document.getElementById('btn-gear-prev'),
      btnGearNext: document.getElementById('btn-gear-next'),
      mobileGearBtns: Array.from(document.querySelectorAll('.mobile-gear-btn[data-gear-id]')),
      earthTooltip: document.getElementById('earth-tooltip'),
      keySpinbutton: document.getElementById('key-spinbutton'),
      liveAnnouncer: document.getElementById('live-announcer')
    };

    this.machine = new ThreeGearMachine(this.dom.canvas, {
      onKeyStep: (delta) => this._handleKeyStep(delta),
      onSelectGear: (id) => this.engageGear(id),
      onLockedAttempt: () => {
        this._announce('Meridian gear is locked in 24-hour sync mode. Switch to 12-hour mode to unlock.');
      },
      onHoverEarth: (info) => this._handleEarthHover(info),
      onHoverInteract: (info) => this._handleRoomInteractHover(info),
      onSelectCountry: (country, opts) => this._applyCountrySelection(country, opts),
      onEarthStepChange: (step) => this._updateEarthStepUi(step),
      onRequestSpacePov: () => this.setPov('space'),
      onTelescopeTelemetry: (t) => {
        if (this.dom.telescopeHudInfo) {
          if (this._scopeNotice) {
            this.dom.telescopeHudInfo.textContent = this._scopeNotice;
            return;
          }
          const altSign = t.elevDeg >= 0 ? '+' : '';
          const fovStr = t.fovDeg ? ` · FOV ${t.fovDeg.toFixed(1)}°` : '';
          const modeTag = t.solarFilterActive
            ? ' · ND5 FILTER'
            : t.targetBody
              ? ` · TRACK ${t.targetBody.toUpperCase()}`
              : '';
          this.dom.telescopeHudInfo.textContent =
            `AZ ${Math.round(t.azDeg)}° · ALT ${altSign}${Math.round(t.elevDeg)}° · ${t.zoomLabel}${fovStr}${modeTag}`;
        }
      },
      onTelescopeTargetChange: (body) => {
        this.state.telescopeTarget = body;
        this._syncTelescopeTargetsUi();
      },
      onZoomChange: (label) => {
        if (this.dom.btnZoomReset) {
          this.dom.btnZoomReset.textContent = label;
        }
      },
      onTurretFaceChange: (cluster) => {
        let target = this._lastClusterGear[cluster];
        if (this.state.is24h && target === 'ampm') target = 'hour';
        this.engageGear(target, { announce: false, rotateToFace: false, focusStructure: false });
      },
      onTurretAngleChange: (deg) => {
        if (this.dom.btnAxisScrub) {
          this.dom.btnAxisScrub.textContent = `${deg}°`;
        }
      }
    });

    this._populateCountrySelect(localTz);
    this._initAllGearLabels();
    this._bindControls();
    this.engageGear('year', { announce: false, focusStructure: false });
    this.machine.highlightCountry(this.state.countryId);
    this._syncUI({ announce: false });

    // Start cleanly on the compact current date/time summary and keep WebGL paused until Edit Time
    this._syncSavedViewText();
    if (this.dom.savedEyebrow) {
      this.dom.savedEyebrow.textContent = 'CURRENT DATE & TIME';
    }
    this.dom.pickerView.hidden = true;
    this.dom.savedView.hidden = false;
    this.machine.setPaused(true);

    this._initEmbedMode();
  }

  // Embed mode (index.html?embed=1 inside an iframe): open straight into the picker,
  // and hand the saved value back to the host page instead of showing the landing screen.
  _initEmbedMode() {
    const params = new URLSearchParams(window.location.search);
    this.isEmbedded = params.get('embed') === '1' && window.parent !== window;
    if (!this.isEmbedded) return;

    document.body.dataset.embed = '1';
    const btnCancel = document.getElementById('btn-embed-cancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => this._closeEmbed());
    }

    // The host preloads this page in the background. 'standby' = warm up the 3D scene
    // briefly (compiles shaders, uploads textures) and then pause until 'open' arrives.
    let standbyTimer = null;
    window.addEventListener('message', (e) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const type = e.data && e.data.type;
      if (type === 'neon-picker:open') {
        if (standbyTimer) clearTimeout(standbyTimer);
        standbyTimer = null;
        // Nothing picked yet: start from the current time, not the time the form was loaded
        if (!this._embedHasSaved) this.syncToNow();
        this.editSelection();
        this.machine.playOpeningDolly();
      } else if (type === 'neon-picker:standby') {
        if (standbyTimer) clearTimeout(standbyTimer);
        standbyTimer = setTimeout(() => {
          standbyTimer = null;
          this.state.isSaved = true;
          this.machine.setPaused(true);
        }, 1500);
      }
    });

    // Background preload: never pull keyboard focus out of the host form
    this.editSelection({ focus: false });
    this._postToHost({ type: 'neon-picker:ready' });
  }

  _postToHost(message) {
    if (!this.isEmbedded) return;
    window.parent.postMessage(message, window.location.origin);
  }

  _closeEmbed() {
    this.state.isSaved = true;
    this.machine.setPaused(true);
    this._postToHost({ type: 'neon-picker:cancel' });
  }

  _populateCountrySelect(localTz) {
    const sel = this.dom.tzSelect;
    sel.innerHTML = '';

    for (const c of COUNTRY_TIMEZONES) {
      const opt = document.createElement('option');
      opt.value = c.id;
      if (c.id === 'local') {
        opt.textContent = `Local (${localTz.country})`;
      } else {
        opt.textContent = c.label;
      }
      sel.appendChild(opt);
    }
    sel.value = this.state.countryId;
  }

  _positionHoverTooltip(text, x, y) {
    const tip = this.dom.earthTooltip;
    tip.textContent = text;
    tip.hidden = false;

    const vw = window.innerWidth;
    const tipW = tip.offsetWidth || 240;
    const left = x > vw - tipW - 24 ? Math.max(12, x - tipW - 14) : x + 14;
    const top = Math.max(46, y - 26);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  _handleEarthHover(info) {
    if (!info || !info.country) {
      if (this.state.povMode === 'space') {
        this.dom.earthTooltip.hidden = true;
      }
      return;
    }
    const c = info.country;
    this._positionHoverTooltip(
      `${c.country} (${formatOffsetLabel(c.offsetHours)}) · Click to select`,
      info.x,
      info.y
    );
  }

  _handleRoomInteractHover(info) {
    if (!info || !info.text) {
      if (this.state.povMode === 'earth') {
        this.dom.earthTooltip.hidden = true;
      }
      return;
    }
    this._positionHoverTooltip(info.text, info.x, info.y);
  }

  _applyCountrySelection(country, { enterPov = false } = {}) {
    if (!country) return;
    this.state.countryId = country.id;
    this.state.countryName = country.country;
    this.state.tzOffsetHours = country.offsetHours;
    this.state.observerLatDeg = country.latDeg;
    this.state.observerLonDeg = country.lonDeg;
    this.state.tzLabel = country.label;

    const sel = this.dom.tzSelect;
    let customOpt = sel.querySelector('option[value="custom"]');
    if (country.id === 'custom') {
      if (!customOpt) {
        customOpt = document.createElement('option');
        customOpt.value = 'custom';
        sel.appendChild(customOpt);
      }
      customOpt.textContent = country.label;
      sel.value = 'custom';
    } else {
      sel.value = country.id;
    }

    this.machine.highlightCountry(country.id);
    this._syncUI({ announce: false });

    if (enterPov) {
      this.setPov('earth');
    }

    this._announce(
      `Selected ${country.country} (${formatMeridianLabel(country.lonDeg)}, ${formatOffsetLabel(country.offsetHours)}).`
    );
  }

  _makeLabelFn(id) {
    const dim = tm.daysInMonth(this.state.year, this.state.month);
    const sig = `${this.state.year}-${this.state.month}-${this.state.day}-${this.state.hour}-${this.state.is24h}`;

    const fn = (stepVal) => {
      if (id === 'year') {
        return {
          text: String(stepVal),
          outOfRange: stepVal < tm.MIN_YEAR || stepVal > tm.MAX_YEAR
        };
      }
      if (id === 'month') {
        return { text: tm.MONTHS_SHORT[mod(stepVal, 12)] };
      }
      if (id === 'day') {
        const d = mod(this.state.day - 1 + (stepVal - this.lastSteps.day), dim) + 1;
        return { text: tm.pad2(d) };
      }
      if (id === 'hour') {
        if (this.state.is24h) {
          const h24 = mod(this.state.hour + (stepVal - this.lastSteps.hour), 24);
          return { text: tm.pad2(h24) };
        }
        const h12 = mod(stepVal, 12);
        return { text: tm.pad2(h12 === 0 ? 12 : h12) };
      }
      if (id === 'minute') {
        return { text: tm.pad2(mod(stepVal, 60)) };
      }
      if (id === 'ampm') {
        const isPM = mod(stepVal, 2) === 1;
        return {
          text: isPM ? 'PM ☾' : 'AM ☀',
          accent: isPM ? 'amber' : 'gold'
        };
      }
      return { text: '' };
    };
    fn.sig = sig;
    return fn;
  }

  _initAllGearLabels() {
    for (const id of ['year', 'month', 'day', 'hour', 'minute', 'ampm']) {
      this.machine.registerGearState(id, this.lastSteps[id], this._makeLabelFn(id));
    }
  }

  engageGear(id, { announce = true, rotateToFace = true, focusStructure = true } = {}) {
    const gs = this.machine.gearStates[id];
    if (!gs) return;
    if (gs.isLocked) {
      this._announce('Meridian gear is locked in 24-hour sync mode.');
      return;
    }

    this.state.engagedGearId = id;
    this.machine.setEngagedGear(id, { rotateToFace, focusStructure });

    if (this.dom.activeGearText) {
      this.dom.activeGearText.textContent = `Driving: ${GEAR_LABELS[id]}`;
    }
    this._syncMobileGearBar();
    this._syncKeySpinbuttonAria();
    this._syncRemoteDisplay();

    if (announce) {
      this._announce(`Coupled to ${GEAR_LABELS[id]} gear.`);
    }
  }

  _syncMobileGearBar() {
    const engagedId = this.state.engagedGearId;
    const isTime = ['hour', 'minute', 'ampm'].includes(engagedId);
    this._lastClusterGear[isTime ? 'time' : 'date'] = engagedId;

    if (this.dom.btnClusterDate && this.dom.btnClusterTime) {
      this.dom.btnClusterDate.classList.toggle('is-active', !isTime);
      this.dom.btnClusterDate.setAttribute('aria-pressed', String(!isTime));
      this.dom.btnClusterTime.classList.toggle('is-active', isTime);
      this.dom.btnClusterTime.setAttribute('aria-pressed', String(isTime));
    }

    if (this.dom.mobileGearsDate && this.dom.mobileGearsTime) {
      this.dom.mobileGearsDate.hidden = isTime;
      this.dom.mobileGearsTime.hidden = !isTime;
    }

    if (this.dom.mobileGearBtns) {
      for (const btn of this.dom.mobileGearBtns) {
        const gid = btn.dataset.gearId;
        const active = gid === engagedId;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
        if (gid === 'ampm') {
          btn.disabled = this.state.is24h;
          btn.setAttribute('aria-disabled', String(this.state.is24h));
        }
      }
    }

    const label = (GEAR_LABELS[engagedId] || engagedId).toLowerCase();
    if (this.dom.btnGearPrev) {
      this.dom.btnGearPrev.setAttribute('aria-label', `Previous ${label}`);
    }
    if (this.dom.btnGearNext) {
      this.dom.btnGearNext.setAttribute('aria-label', `Next ${label}`);
    }
  }

  _handleKeyStep(delta) {
    if (!delta) return;
    const id = this.state.engagedGearId;
    const gs = this.machine.gearStates[id];
    if (!gs || gs.isLocked) return;

    if (id === 'year') {
      const nextStep = Math.max(tm.MIN_YEAR, Math.min(tm.MAX_YEAR, this.lastSteps.year + delta));
      if (nextStep === this.lastSteps.year) return;
      this.lastSteps.year = nextStep;
      const clamped = tm.withDate(this.state, { year: nextStep });
      this.state.year = clamped.year;
      this.state.day = clamped.day;

      this.machine.setGearTargetStep('year', nextStep, this._makeLabelFn('year'));
      if (clamped.clampedDayDelta !== 0) {
        this.lastSteps.day += clamped.clampedDayDelta;
        this.machine.setGearTargetStep('day', this.lastSteps.day, this._makeLabelFn('day'));
      } else {
        this.machine.refreshGearLabels('day', this._makeLabelFn('day'));
      }
    } else if (id === 'month') {
      this.lastSteps.month += delta;
      const newMonth = mod(this.lastSteps.month, 12) + 1;
      const clamped = tm.withDate(this.state, { month: newMonth });
      this.state.month = clamped.month;
      this.state.day = clamped.day;

      this.machine.setGearTargetStep('month', this.lastSteps.month, this._makeLabelFn('month'));
      if (clamped.clampedDayDelta !== 0) {
        this.lastSteps.day += clamped.clampedDayDelta;
        this.machine.setGearTargetStep('day', this.lastSteps.day, this._makeLabelFn('day'));
      } else {
        this.machine.refreshGearLabels('day', this._makeLabelFn('day'));
      }
    } else if (id === 'day') {
      const dim = tm.daysInMonth(this.state.year, this.state.month);
      this.lastSteps.day += delta;
      this.state.day = mod(this.state.day - 1 + delta, dim) + 1;
      this.machine.setGearTargetStep('day', this.lastSteps.day, this._makeLabelFn('day'));
    } else if (id === 'hour') {
      this.lastSteps.hour += delta;
      if (this.state.is24h) {
        const prevPM = this.state.hour >= 12;
        const nextHour = mod(this.state.hour + delta, 24);
        this.state.hour = nextHour;
        const nextPM = nextHour >= 12;
        this.machine.setGearTargetStep('hour', this.lastSteps.hour, this._makeLabelFn('hour'));
        if (prevPM !== nextPM) {
          this.lastSteps.ampm += 1;
          this.machine.setGearTargetStep('ampm', this.lastSteps.ampm, this._makeLabelFn('ampm'));
        }
      } else {
        const isPM = this.state.hour >= 12;
        const next12Mod = mod(this.lastSteps.hour, 12);
        this.state.hour = tm.hour12To24(next12Mod, isPM);
        this.machine.setGearTargetStep('hour', this.lastSteps.hour, this._makeLabelFn('hour'));
      }
    } else if (id === 'minute') {
      this.lastSteps.minute += delta;
      this.state.minute = mod(this.lastSteps.minute, 60);
      this.machine.setGearTargetStep('minute', this.lastSteps.minute, this._makeLabelFn('minute'));
    } else if (id === 'ampm') {
      this.lastSteps.ampm += delta;
      const nextPM = mod(this.lastSteps.ampm, 2) === 1;
      this.state.hour = tm.hour12To24(this.state.hour % 12, nextPM);
      this.machine.setGearTargetStep('ampm', this.lastSteps.ampm, this._makeLabelFn('ampm'));
    }

    this._syncUI({ announce: true, changedId: id });
  }

  _updateBottomHint() {
    if (this.state.povMode === 'space') {
      this.dom.bottomHint.textContent =
        'Drag gear or key to set · Drag ring to rotate axis · Click Earth for country';
    } else if (this.state.earthStep === 'telescope') {
      this.dom.bottomHint.textContent =
        `Telescope eyepiece over ${this.state.countryName} · Drag sky 360° · Press Done or Esc to return to Room`;
    } else if (this.state.earthStep === 'remote') {
      this.dom.bottomHint.textContent =
        `Desk Remote (${this.state.countryName}) · Twist jog wheel or press channel · Press DONE on remote or Esc to return to Room`;
    } else {
      this.dom.bottomHint.textContent =
        `Observatory Room (${this.state.countryName}) · Click Remote or Telescope to focus · Click Monitor for Space`;
    }
  }

  _updateEarthStepUi(step) {
    if (step) {
      this.state.earthStep = step;
    }
    const inEarth = this.state.povMode === 'earth';
    const isRoom = inEarth && this.state.earthStep === 'room';
    const isRemote = inEarth && this.state.earthStep === 'remote';
    const isTelescope = inEarth && this.state.earthStep === 'telescope';

    if (this.dom.earthStepNav) {
      this.dom.earthStepNav.hidden = !inEarth;
    }
    if (this.dom.btnEarthRoom) {
      this.dom.btnEarthRoom.classList.toggle('is-active', isRoom);
      this.dom.btnEarthRoom.setAttribute('aria-pressed', String(isRoom));
    }
    if (this.dom.btnEarthRemote) {
      this.dom.btnEarthRemote.classList.toggle('is-active', isRemote);
      this.dom.btnEarthRemote.setAttribute('aria-pressed', String(isRemote));
    }
    if (this.dom.btnEarthTelescope) {
      this.dom.btnEarthTelescope.classList.toggle('is-active', isTelescope);
      this.dom.btnEarthTelescope.setAttribute('aria-pressed', String(isTelescope));
    }
    if (this.dom.btnEarthDone) {
      this.dom.btnEarthDone.hidden = !(inEarth && !isRoom);
    }
    if (this.dom.telescopeOverlay) {
      this.dom.telescopeOverlay.hidden = !isTelescope;
    }
    if (this.dom.telescopeTargets) {
      this.dom.telescopeTargets.hidden = !isTelescope;
    }
    this._syncTelescopeTargetsUi();
    document.body.dataset.pov = this.state.povMode;
    document.body.dataset.earthStep = this.state.earthStep;
    this._updateBottomHint();
  }

  _syncTelescopeTargetsUi() {
    const c = this.currentCelestial;
    const target = this.state.telescopeTarget;

    if (this.dom.btnScopeSun) {
      const sunAlt = c ? Math.round(c.sunHorizon.altDeg) : 0;
      const sunAbove = !c || c.sunHorizon.altDeg >= -1.2;
      this.dom.btnScopeSun.textContent = sunAbove
        ? `☀ Sun ${sunAlt >= 0 ? '+' : ''}${sunAlt}°`
        : '☀ Sun (Set)';
      this.dom.btnScopeSun.classList.toggle('is-active', target === 'sun');
      this.dom.btnScopeSun.classList.toggle('is-below', !sunAbove);
      this.dom.btnScopeSun.setAttribute('aria-pressed', String(target === 'sun'));
    }

    if (this.dom.btnScopeMoon) {
      const moonAlt = c ? Math.round(c.moonHorizon.altDeg) : 0;
      const moonAbove = !c || c.moonHorizon.altDeg >= -1.2;
      this.dom.btnScopeMoon.textContent = moonAbove
        ? `☾ Moon ${moonAlt >= 0 ? '+' : ''}${moonAlt}°`
        : '☾ Moon (Set)';
      this.dom.btnScopeMoon.classList.toggle('is-active', target === 'moon');
      this.dom.btnScopeMoon.classList.toggle('is-below', !moonAbove);
      this.dom.btnScopeMoon.setAttribute('aria-pressed', String(target === 'moon'));
    }
  }

  _focusTelescopeTarget(body) {
    const res = this.machine.focusTelescopeBody(body, { zoomToAcquire: true });
    const label = body === 'sun' ? 'Sun' : 'Moon';
    if (!res.visible) {
      const altRounded = Math.round(res.altDeg);
      const hint = body === 'sun' ? 'Set daytime to view' : 'Change time/date to view';
      this._scopeNotice = `${label} below horizon (${altRounded}°) · ${hint}`;
      if (this._scopeNoticeTimer) clearTimeout(this._scopeNoticeTimer);
      this._scopeNoticeTimer = setTimeout(() => {
        this._scopeNotice = '';
      }, 3600);
      this._announce(`${label} is currently below the horizon at ${altRounded} degrees. ${hint}.`);
    } else {
      this._scopeNotice = '';
      this._announce(`Locked Telescope onto ${label} at azimuth ${Math.round(res.azDeg)} degrees, altitude ${Math.round(res.altDeg)} degrees.`);
    }
    this._syncTelescopeTargetsUi();
  }

  setPov(povMode) {
    const mode = povMode === 'earth' ? 'earth' : 'space';
    if (this.state.povMode === mode) return;
    this.state.povMode = mode;
    if (mode === 'earth') {
      this.state.earthStep = 'room';
    }
    this.dom.earthTooltip.hidden = true;
    this.machine.setPov(mode);

    const isEarth = mode === 'earth';
    this.dom.btnPovSpace.classList.toggle('is-active', !isEarth);
    this.dom.btnPovSpace.setAttribute('aria-pressed', String(!isEarth));
    this.dom.btnPovEarth.classList.toggle('is-active', isEarth);
    this.dom.btnPovEarth.setAttribute('aria-pressed', String(isEarth));

    if (this.dom.btnZoomReset) {
      this.dom.btnZoomReset.textContent = this.machine.getZoomLabel();
    }

    this._updateEarthStepUi(isEarth ? 'room' : null);

    this._announce(
      isEarth
        ? `Entered Observatory Room in ${this.state.countryName}. Check the weather out the window, operate the desk console, or click the Telescope.`
        : 'Switched to Outer Space POV viewing all celestial objects and golden gear clusters.'
    );
  }

  _syncSavedViewText() {
    const dateStr = tm.formatDisplayDate(this.state.year, this.state.month, this.state.day);
    const timeStr = tm.formatDisplayTime(this.state.hour, this.state.minute, this.state.is24h);
    const iso = tm.toISOString(this.state);

    this.dom.savedPrimary.textContent = `${dateStr} · ${timeStr}`;
    if (this.dom.savedSky) {
      this.dom.savedSky.textContent = this._skySummaryText || (this.dom.readoutSky ? this.dom.readoutSky.textContent : '');
    }
    if (this.dom.savedCopyIso) {
      this.dom.savedCopyIso.textContent = iso;
    }
    return { dateStr, timeStr, iso };
  }

  saveSelection() {
    this.state.isSaved = true;
    const { dateStr, timeStr, iso } = this._syncSavedViewText();
    if (this.dom.savedEyebrow) {
      this.dom.savedEyebrow.textContent = 'SAVED DATE & TIME';
    }

    // Embedded: keep the last 3D frame on screen so the host's closing iris has something to show
    if (!this.isEmbedded) {
      this.dom.pickerView.hidden = true;
      this.dom.savedView.hidden = false;
    }
    this.machine.setPaused(true);

    window.dispatchEvent(
      new CustomEvent('neon-datetime-save', {
        detail: {
          year: this.state.year,
          month: this.state.month,
          day: this.state.day,
          hour: this.state.hour,
          minute: this.state.minute,
          is24h: this.state.is24h,
          country: this.state.countryName,
          iso
        }
      })
    );

    if (this.isEmbedded) {
      this._embedHasSaved = true;
      this._postToHost({
        type: 'neon-picker:save',
        iso,
        display: `${dateStr} · ${timeStr}`,
        country: this.state.countryName
      });
      return;
    }

    if (this.dom.btnEdit) {
      this.dom.btnEdit.focus();
    }
    this._announce(`Saved ${dateStr} at ${timeStr}. Press Edit Time to make changes.`);
  }

  editSelection({ focus = true } = {}) {
    this.state.isSaved = false;
    this.dom.savedView.hidden = true;
    this.dom.pickerView.hidden = false;
    this.machine.setPaused(false);
    window.requestAnimationFrame(() => {
      if (!this.state.isSaved) {
        this.machine._resize();
      }
    });

    if (focus && this.dom.btnSave) {
      this.dom.btnSave.focus();
    }
    this._announce('Returned to 3D gear date and time editor.');
  }

  _syncRemoteDisplay() {
    const id = this.state.engagedGearId;
    const iso = tm.toISOString(this.state);
    this.machine.updateRemoteDisplay({
      gearLabel: GEAR_LABELS[id] || id.toUpperCase(),
      dateLine: iso.slice(0, 10),
      timeLine: tm.formatDisplayTime(this.state.hour, this.state.minute, this.state.is24h),
      locationLine: `${this.state.countryName} · ${formatOffsetLabel(this.state.tzOffsetHours)}`,
      locked: this.state.is24h && id === 'ampm'
    });
  }

  toggleTimeFormat() {
    this.state.is24h = !this.state.is24h;
    const is24 = this.state.is24h;

    this.dom.btnFormatToggle.setAttribute('aria-pressed', String(is24));
    this.dom.btnFormatToggle.textContent = is24 ? '24H / 12H' : '12H / 24H';

    this.machine.setGearLocked('ampm', is24);

    const nextHourStep = is24 ? this.state.hour : (this.state.hour % 12);
    this.lastSteps.hour = nextHourStep;
    this.machine.setGearImmediate('hour', nextHourStep, this._makeLabelFn('hour'));

    const targetAmpm = this.state.hour >= 12 ? 1 : 0;
    if (mod(this.lastSteps.ampm, 2) !== targetAmpm) {
      this.lastSteps.ampm += 1;
      this.machine.setGearTargetStep('ampm', this.lastSteps.ampm, this._makeLabelFn('ampm'));
    } else {
      this.machine.refreshGearLabels('ampm', this._makeLabelFn('ampm'));
    }

    if (is24 && this.state.engagedGearId === 'ampm') {
      this.engageGear('hour', { announce: false });
    } else {
      this._syncMobileGearBar();
    }

    this._syncUI({ announce: false });
    this._announce(is24 ? 'Switched to 24-hour clock format.' : 'Switched to 12-hour clock format.');
  }

  syncToNow() {
    const n = tm.now();
    const dayDelta = n.day - this.state.day;
    const monthDelta = mod(n.month - this.state.month, 12);
    const minuteDelta = mod(n.minute - this.state.minute, 60);
    const prevPM = this.state.hour >= 12;
    const nextPM = n.hour >= 12;

    this.state.year = n.year;
    this.state.month = n.month;
    this.state.day = n.day;
    this.state.hour = n.hour;
    this.state.minute = n.minute;

    this.lastSteps.year = n.year;
    this.lastSteps.month += monthDelta;
    this.lastSteps.day += dayDelta;
    this.lastSteps.minute += minuteDelta;

    const targetHourStep = this.state.is24h ? n.hour : (n.hour % 12);
    const currHourMod = this.state.is24h ? mod(this.lastSteps.hour, 24) : mod(this.lastSteps.hour, 12);
    this.lastSteps.hour += targetHourStep - currHourMod;

    if (prevPM !== nextPM) {
      this.lastSteps.ampm += 1;
    }

    this.machine.crankKeyStep(2);
    for (const id of ['year', 'month', 'day', 'hour', 'minute', 'ampm']) {
      this.machine.setGearTargetStep(id, this.lastSteps[id], this._makeLabelFn(id));
    }

    this._syncUI({ announce: false });
    this._announce(
      `Synchronized to current time: ${tm.formatDisplayDate(n.year, n.month, n.day)}, ${tm.formatDisplayTime(n.hour, n.minute, this.state.is24h)}.`
    );
  }

  async copyIso(targetBtn = this.dom.btnCopyIso) {
    const iso = tm.toISOString(this.state);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(iso);
      } else {
        const area = document.createElement('textarea');
        area.value = iso;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      targetBtn.textContent = `${iso} · Copied`;
      this._announce(`Copied ${iso} to clipboard.`);
    } catch (_) {
      targetBtn.textContent = iso;
    }
    if (this._copyFeedbackTimer) clearTimeout(this._copyFeedbackTimer);
    this._copyFeedbackTimer = setTimeout(() => {
      targetBtn.textContent = tm.toISOString(this.state);
    }, 1800);
  }

  _syncKeySpinbuttonAria() {
    const id = this.state.engagedGearId;
    const dim = tm.daysInMonth(this.state.year, this.state.month);
    const { hour12, isPM } = tm.hour24To12(this.state.hour);
    const sb = this.dom.keySpinbutton;

    const specs = {
      year: [this.state.year, tm.MIN_YEAR, tm.MAX_YEAR, `Year ${this.state.year}`],
      month: [this.state.month, 1, 12, `Month ${tm.MONTHS_FULL[this.state.month - 1]}`],
      day: [this.state.day, 1, dim, `Day ${this.state.day}`],
      hour: [
        this.state.is24h ? this.state.hour : hour12,
        this.state.is24h ? 0 : 1,
        this.state.is24h ? 23 : 12,
        this.state.is24h ? `Hour ${tm.pad2(this.state.hour)}` : `Hour ${hour12} ${isPM ? 'PM' : 'AM'}`
      ],
      minute: [this.state.minute, 0, 59, `Minute ${tm.pad2(this.state.minute)}`],
      ampm: [isPM ? 1 : 0, 0, 1, isPM ? 'PM' : 'AM']
    };

    const [nowVal, minVal, maxVal, text] = specs[id];
    sb.setAttribute('aria-valuenow', String(nowVal));
    sb.setAttribute('aria-valuemin', String(minVal));
    sb.setAttribute('aria-valuemax', String(maxVal));
    sb.setAttribute('aria-valuetext', text);
  }

  _syncUI({ announce = false, changedId = null } = {}) {
    const dateStr = tm.formatDisplayDate(this.state.year, this.state.month, this.state.day);
    const timeStr = tm.formatDisplayTime(this.state.hour, this.state.minute, this.state.is24h);
    const iso = tm.toISOString(this.state);

    this.dom.readoutPrimary.textContent = `${dateStr} · ${timeStr}`;
    if (this.dom.btnCopyIso) {
      this.dom.btnCopyIso.textContent = iso;
    }

    const c = computeCelestialState({
      year: this.state.year,
      month: this.state.month,
      day: this.state.day,
      hour: this.state.hour,
      minute: this.state.minute,
      tzOffsetHours: this.state.tzOffsetHours,
      observerLatDeg: this.state.observerLatDeg,
      observerLonDeg: this.state.observerLonDeg
    });
    this.currentCelestial = c;
    const weather = computeWeatherCondition(this.state, c);
    this.currentWeather = weather;
    this.machine.updateAstronomy(c, weather);

    const sunAlt = Math.round(c.sunHorizon.altDeg);
    const sunSign = sunAlt >= 0 ? `+${sunAlt}°` : `${sunAlt}°`;
    const icon = weather.id === 'rain' ? '☂' : c.skyState === 'DAY' ? '☀' : c.skyState === 'NIGHT' ? '☾' : '◐';
    const offsetStr = formatOffsetLabel(this.state.tzOffsetHours);
    const meridianStr = formatMeridianLabel(c.tzLonDeg);

    this._skySummaryText =
      `${this.state.countryName} (${offsetStr} · ${meridianStr}) · ${icon} ${weather.label} ${sunSign} · ${c.moonPhaseName}`;
    if (this.dom.readoutSky) {
      this.dom.readoutSky.textContent = this._skySummaryText;
    }

    this._updateBottomHint();
    this._syncTelescopeTargetsUi();
    document.body.dataset.pov = this.state.povMode;

    this._syncKeySpinbuttonAria();
    this._syncRemoteDisplay();

    window.dispatchEvent(
      new CustomEvent('neon-datetime-change', {
        detail: {
          year: this.state.year,
          month: this.state.month,
          day: this.state.day,
          hour: this.state.hour,
          minute: this.state.minute,
          is24h: this.state.is24h,
          country: this.state.countryName,
          weather: weather.label,
          meridianDeg: c.tzLonDeg,
          iso
        }
      })
    );

    if (announce) {
      const isTime = changedId && ['hour', 'minute', 'ampm'].includes(changedId);
      this._announce(
        isTime
          ? `Time set to ${timeStr}. ${weather.label} over ${this.state.countryName}, Sun altitude ${sunAlt} degrees.`
          : `Date set to ${dateStr}. Weather ${weather.label}, Moon phase ${c.moonPhaseName}.`
      );
    }
  }

  _bindControls() {
    this.dom.tzSelect.addEventListener('change', () => {
      const selectedId = this.dom.tzSelect.value;
      if (selectedId === 'local') {
        const localTz = detectLocalTimezone();
        this._applyCountrySelection({
          id: localTz.matchedId || 'local',
          country: localTz.country,
          offsetHours: localTz.offsetHours,
          latDeg: localTz.latDeg,
          lonDeg: localTz.lonDeg,
          label: `${localTz.country} (${formatOffsetLabel(localTz.offsetHours)})`
        });
        this.dom.tzSelect.value = 'local';
      } else {
        const preset = COUNTRY_TIMEZONES.find((c) => c.id === selectedId);
        if (preset) {
          this._applyCountrySelection(preset);
        }
      }
    });

    this.dom.btnPovSpace.addEventListener('click', () => this.setPov('space'));
    this.dom.btnPovEarth.addEventListener('click', () => this.setPov('earth'));
    if (this.dom.btnEarthRoom) {
      this.dom.btnEarthRoom.addEventListener('click', () => this.machine.setEarthStep('room'));
    }
    if (this.dom.btnEarthRemote) {
      this.dom.btnEarthRemote.addEventListener('click', () => this.machine.setEarthStep('remote'));
    }
    if (this.dom.btnEarthTelescope) {
      this.dom.btnEarthTelescope.addEventListener('click', () => this.machine.setEarthStep('telescope'));
    }
    if (this.dom.btnEarthDone) {
      this.dom.btnEarthDone.addEventListener('click', () => this.machine.setEarthStep('room'));
    }
    if (this.dom.btnScopeSun) {
      this.dom.btnScopeSun.addEventListener('click', () => this._focusTelescopeTarget('sun'));
    }
    if (this.dom.btnScopeMoon) {
      this.dom.btnScopeMoon.addEventListener('click', () => this._focusTelescopeTarget('moon'));
    }
    this.dom.btnFormatToggle.addEventListener('click', () => this.toggleTimeFormat());
    this.dom.btnNow.addEventListener('click', () => this.syncToNow());
    if (this.dom.btnCopyIso) {
      this.dom.btnCopyIso.addEventListener('click', () => this.copyIso(this.dom.btnCopyIso));
    }
    if (this.dom.savedCopyIso) {
      this.dom.savedCopyIso.addEventListener('click', () => this.copyIso(this.dom.savedCopyIso));
    }

    this.dom.btnZoomIn.addEventListener('click', () => {
      const factor = this.state.povMode === 'earth' && this.state.earthStep === 'telescope' ? 1.45 : 1.25;
      this.machine.zoomIn(factor);
    });
    this.dom.btnZoomOut.addEventListener('click', () => {
      const factor = this.state.povMode === 'earth' && this.state.earthStep === 'telescope' ? 1.45 : 1.25;
      this.machine.zoomOut(factor);
    });
    this.dom.btnZoomReset.addEventListener('click', () => this.machine.resetZoom());
    this.dom.btnSave.addEventListener('click', () => this.saveSelection());
    this.dom.btnEdit.addEventListener('click', () => this.editSelection());

    if (this.dom.btnClusterDate) {
      this.dom.btnClusterDate.addEventListener('click', () => {
        this.engageGear(this._lastClusterGear.date);
      });
    }
    if (this.dom.btnClusterTime) {
      this.dom.btnClusterTime.addEventListener('click', () => {
        let target = this._lastClusterGear.time;
        if (this.state.is24h && target === 'ampm') target = 'hour';
        this.engageGear(target);
      });
    }
    for (const btn of this.dom.mobileGearBtns) {
      btn.addEventListener('click', () => {
        this.engageGear(btn.dataset.gearId);
      });
    }
    if (this.dom.btnGearPrev) {
      this.dom.btnGearPrev.addEventListener('click', () => {
        this.machine.crankKeyStep(-1);
        this._handleKeyStep(-1);
      });
    }
    if (this.dom.btnGearNext) {
      this.dom.btnGearNext.addEventListener('click', () => {
        this.machine.crankKeyStep(1);
        this._handleKeyStep(1);
      });
    }
    if (this.dom.btnAxisCcw) {
      this.dom.btnAxisCcw.addEventListener('click', () => {
        this.machine.rotateTurretBy(-Math.PI / 3);
      });
    }
    if (this.dom.btnAxisCw) {
      this.dom.btnAxisCw.addEventListener('click', () => {
        this.machine.rotateTurretBy(Math.PI / 3);
      });
    }
    if (this.dom.btnAxisScrub) {
      const scrubEl = this.dom.btnAxisScrub;
      let scrubPid = null;
      let scrubStartX = 0;
      let scrubLastX = 0;
      let scrubMoved = false;

      scrubEl.addEventListener('pointerdown', (e) => {
        scrubPid = e.pointerId;
        scrubStartX = e.clientX;
        scrubLastX = e.clientX;
        scrubMoved = false;
        if (scrubEl.setPointerCapture) {
          try {
            scrubEl.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
      });

      scrubEl.addEventListener('pointermove', (e) => {
        if (scrubPid !== e.pointerId) return;
        const dx = e.clientX - scrubLastX;
        scrubLastX = e.clientX;
        if (!scrubMoved && Math.abs(e.clientX - scrubStartX) > 4) {
          scrubMoved = true;
        }
        if (scrubMoved && dx !== 0) {
          this.machine.scrubTurret(dx * 0.016);
        }
      });

      const endScrub = (e) => {
        if (scrubPid !== e.pointerId) return;
        scrubPid = null;
        if (scrubEl.hasPointerCapture && scrubEl.hasPointerCapture(e.pointerId)) {
          try {
            scrubEl.releasePointerCapture(e.pointerId);
          } catch (_) {}
        }
        if (!scrubMoved) {
          this.machine.snapTurretToNearestFace();
        }
      };

      scrubEl.addEventListener('pointerup', endScrub);
      scrubEl.addEventListener('pointercancel', endScrub);
    }

    const handleSpinKey = (e) => {
      if (this.state.isSaved) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && e.target.tagName === 'SELECT') return;

      if (e.key === 'Escape' && this.state.povMode === 'earth' && this.state.earthStep !== 'room') {
        e.preventDefault();
        this.machine.setEarthStep('room');
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.machine.zoomIn();
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        this.machine.zoomOut();
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        this.machine.resetZoom();
        return;
      }

      let delta = 0;
      const id = this.state.engagedGearId;
      const fast = id === 'year' || id === 'minute' ? 5 : id === 'day' ? 7 : 3;

      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = 1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -1;
      else if (e.key === 'PageUp') delta = fast;
      else if (e.key === 'PageDown') delta = -fast;
      else if ((e.key === 'Enter' || e.key === ' ') && id === 'ampm' && e.target === this.dom.keySpinbutton) delta = 1;
      else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const order = ['year', 'month', 'day', 'hour', 'minute', 'ampm'];
        this.engageGear(order[Number(e.key) - 1]);
        return;
      } else {
        return;
      }

      e.preventDefault();
      this.machine.crankKeyStep(delta);
      this._handleKeyStep(delta);
    };

    this.dom.keySpinbutton.addEventListener('keydown', handleSpinKey);
    window.addEventListener('keydown', (e) => {
      if (e.target === this.dom.keySpinbutton) return;
      if (e.target && e.target.tagName === 'SELECT') return;
      if (e.target && e.target.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
      handleSpinKey(e);
    });
  }

  _announce(message) {
    if (!this.dom.liveAnnouncer) return;
    if (this._announceTimer) clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => {
      this.dom.liveAnnouncer.textContent = message;
    }, 110);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.NeonCalibre.appOrrery = new FullScreenOrreryApp();
});
