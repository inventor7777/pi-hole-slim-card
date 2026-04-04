const CARD_VERSION = "2026.04.04-1";
const HOLD_DELAY_MS = 500;

const SECTION_DEFINITIONS = [
  {
    key: "total_queries",
    label: "Total Queries",
    defaultIcon: "mdi:web",
    accent: "blue",
  },
  {
    key: "blocked_queries",
    label: "Queries Blocked",
    defaultIcon: "mdi:hand-back-right",
    accent: "red",
  },
  {
    key: "percentage_blocked",
    label: "Percentage Blocked",
    defaultIcon: "mdi:chart-pie",
    accent: "orange",
  },
  {
    key: "total_domains",
    label: "Domains on Lists",
    defaultIcon: "mdi:playlist-check",
    accent: "green",
  },
];

const ACCENT_STYLES = {
  blue: {
    bg: "#2fa8df",
    bgEnd: "#39b8ee",
    footer: "rgba(0, 0, 0, 0.16)",
    shadow: "rgba(14, 102, 155, 0.35)",
  },
  red: {
    bg: "#e24c39",
    bgEnd: "#ee5d49",
    footer: "rgba(0, 0, 0, 0.16)",
    shadow: "rgba(136, 35, 28, 0.35)",
  },
  orange: {
    bg: "#efa12a",
    bgEnd: "#f9ae37",
    footer: "rgba(0, 0, 0, 0.16)",
    shadow: "rgba(142, 92, 18, 0.35)",
  },
  green: {
    bg: "#069d55",
    bgEnd: "#07ae60",
    footer: "rgba(0, 0, 0, 0.16)",
    shadow: "rgba(8, 92, 54, 0.35)",
  },
};

function getDefaultConfig() {
  return {
    type: "custom:pi-hole-slim-card",
    title: "",
    pi_hole_url: "",
    size: "large",
    sections: SECTION_DEFINITIONS.map((section) => ({
      key: section.key,
      entity: "",
      unit: "",
      sub_entity: "",
      sub_unit: "",
      name: section.label,
      icon: section.defaultIcon,
    })),
  };
}

function normalizeConfig(config) {
  const providedSections = Array.isArray(config?.sections) ? config.sections : [];

  return {
    ...getDefaultConfig(),
    ...(config || {}),
    type: "custom:pi-hole-slim-card",
    title: config?.title ?? "",
    pi_hole_url: config?.pi_hole_url ?? "",
    size: config?.size === "compact" ? "compact" : "large",
    sections: SECTION_DEFINITIONS.map((definition) => {
      const provided = providedSections.find((section) => section?.key === definition.key) || {};
      return {
        key: definition.key,
        entity: provided.entity || "",
        unit: provided.unit || "",
        sub_entity: provided.sub_entity || "",
        sub_unit: provided.sub_unit || "",
        name: provided.name || definition.label,
        icon: provided.icon || definition.defaultIcon,
      };
    }),
  };
}

class PiHoleSlimCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._holdTimer = undefined;
    this._heldElement = undefined;
  }

  static getConfigElement() {
    return document.createElement("pi-hole-slim-card-editor");
  }

  static getStubConfig() {
    return getDefaultConfig();
  }

  setConfig(config) {
    this._config = normalizeConfig(config);
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    this._render();
  }

  getCardSize() {
    return 2;
  }

  _getSectionConfig(key) {
    return this._config?.sections?.find((section) => section.key === key);
  }

  _getStateObject(entityId) {
    if (!entityId || !this._hass) return undefined;
    return this._hass.states?.[entityId];
  }

  _formatNumber(value, options = {}) {
    if (!Number.isFinite(value)) return "--";
    return new Intl.NumberFormat(undefined, options).format(value);
  }

  _formatStateValue(definition, stateObj, unitOverride = "") {
    if (!stateObj) return "--";

    const raw = stateObj.state;
    if (raw === "unknown" || raw === "unavailable" || raw === "" || raw == null) {
      return "--";
    }

    const numericValue = Number(raw);
    const unit = unitOverride || stateObj.attributes?.unit_of_measurement || "";

    if (!Number.isFinite(numericValue)) {
      return String(raw);
    }

    if (definition.key === "percentage_blocked") {
      const suffix = unit || "%";
      return `${this._formatNumber(numericValue, {
        minimumFractionDigits: numericValue % 1 === 0 ? 0 : 1,
        maximumFractionDigits: 2,
      })}${suffix}`;
    }

    const formatted = this._formatNumber(numericValue, {
      maximumFractionDigits: Number.isInteger(numericValue) ? 0 : 2,
    });

    return `${formatted}${unit ? ` ${unit}` : ""}`;
  }

  _formatFooterStateValue(stateObj, unitOverride = "") {
    if (!stateObj) return "";

    const raw = stateObj.state;
    if (raw === "unknown" || raw === "unavailable" || raw === "" || raw == null) {
      return "";
    }

    const numericValue = Number(raw);
    const unit = unitOverride || stateObj.attributes?.unit_of_measurement || "";

    if (!Number.isFinite(numericValue)) {
      return String(raw);
    }

    const formatted = this._formatNumber(numericValue, {
      maximumFractionDigits: Number.isInteger(numericValue) ? 0 : 2,
    });

    return `${formatted}${unit ? ` ${unit}` : ""}`;
  }

  _getFooterText(sectionConfig, stateObj) {
    if (!sectionConfig?.entity) return "Choose an entity";

    const subEntityId = String(sectionConfig?.sub_entity || "").trim();
    if (subEntityId) {
      const subStateObj = this._getStateObject(subEntityId);
      const subValue = this._formatFooterStateValue(subStateObj, sectionConfig?.sub_unit);
      if (subValue) return subValue;
    }

    return "Tap for details";
  }

  _escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  _openMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }

  _openExternalUrl(url) {
    if (!url) return;
    window.open(url, "_blank", "noopener");
  }

  _clearHold() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = undefined;
    }
    this._heldElement = undefined;
  }

  _startHold(element) {
    const url = this._config?.pi_hole_url?.trim();
    if (!url || !element) return;

    this._clearHold();
    this._heldElement = element;
    this._holdTimer = window.setTimeout(() => {
      if (this._heldElement !== element) return;
      element.dataset.holdTriggered = "true";
      this._openExternalUrl(url);
      this._clearHold();
    }, HOLD_DELAY_MS);
  }

  _renderSection(definition) {
    const sectionConfig = this._getSectionConfig(definition.key) || {};
    const stateObj = this._getStateObject(sectionConfig.entity);
    const accent = ACCENT_STYLES[definition.accent];
    const value = this._formatStateValue(definition, stateObj, sectionConfig.unit);
    const footerText = this._getFooterText(sectionConfig, stateObj);
    const label = sectionConfig.name || definition.label;
    const icon = sectionConfig.icon || definition.defaultIcon;
    const disabled = !sectionConfig.entity;
    const footerEntity = sectionConfig.sub_entity || sectionConfig.entity;

    return `
      <div
        class="tile tile--${definition.accent}${disabled ? " tile--disabled" : ""}"
        style="
          --tile-bg: ${accent.bg};
          --tile-bg-end: ${accent.bgEnd};
          --tile-footer: ${accent.footer};
          --tile-shadow: ${accent.shadow};
        "
      >
        <button
          class="tile__main"
          type="button"
          data-entity="${this._escapeHtml(sectionConfig.entity)}"
          data-hold-url="${this._escapeHtml(this._config?.pi_hole_url || "")}"
          ${disabled ? "disabled" : ""}
        >
          <div class="tile__body">
            <div class="tile__label">${this._escapeHtml(label)}</div>
            <div class="tile__value">${this._escapeHtml(value)}</div>
            <ha-icon class="tile__icon" icon="${this._escapeHtml(icon)}"></ha-icon>
          </div>
        </button>
        <button
          class="tile__footer"
          type="button"
          data-entity="${this._escapeHtml(footerEntity)}"
          data-click-area="footer"
          data-hold-url="${this._escapeHtml(this._config?.pi_hole_url || "")}"
          ${disabled ? "disabled" : ""}
        >
          <span class="tile__footer-text">${this._escapeHtml(footerText)}</span>
          <ha-icon class="tile__arrow" icon="mdi:arrow-right-circle"></ha-icon>
        </button>
      </div>
    `;
  }

  _attachEvents() {
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((element) => {
      element.addEventListener("click", () => {
        if (element.dataset.holdTriggered === "true") {
          element.dataset.holdTriggered = "";
          return;
        }
        const entityId = element.dataset.entity;
        this._openMoreInfo(entityId);
      });

      const cancelHold = () => this._clearHold();
      element.addEventListener("pointerdown", () => {
        element.dataset.holdTriggered = "";
        this._startHold(element);
      });
      element.addEventListener("pointerup", cancelHold);
      element.addEventListener("pointerleave", cancelHold);
      element.addEventListener("pointercancel", cancelHold);
      element.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    const title = this._config.title?.trim();
    const sizeClass = this._config.size === "compact" ? "card--compact" : "card--large";

    this.shadowRoot.innerHTML = `
      <ha-card>
        <div class="card ${sizeClass}">
          ${title ? `<div class="card__title">${this._escapeHtml(title)}</div>` : ""}
          <div class="grid">
            ${SECTION_DEFINITIONS.map((definition) => this._renderSection(definition)).join("")}
          </div>
        </div>
      </ha-card>
      <style>
        :host {
          display: block;
        }

        ha-card {
          overflow: hidden;
          border-radius: 22px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0)),
            var(--ha-card-background, var(--card-background-color, #111827));
        }

        .card {
          display: grid;
          gap: 14px;
          padding: 16px;
        }

        .card__title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }

        .grid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        }

        .tile {
          position: relative;
          display: grid;
          grid-template-rows: 1fr auto;
          min-height: 196px;
          border-radius: 20px;
          color: #081017;
          background: linear-gradient(135deg, var(--tile-bg), var(--tile-bg-end));
          box-shadow: 0 18px 32px -24px var(--tile-shadow);
          overflow: hidden;
        }

        .tile:hover {
          transform: translateY(-1px);
          box-shadow: 0 20px 36px -22px var(--tile-shadow);
          filter: saturate(1.04);
        }

        .tile__main,
        .tile__footer {
          padding: 0;
          border: none;
          color: inherit;
          text-align: left;
          cursor: pointer;
          background: transparent;
          font: inherit;
        }

        .tile__main:focus-visible,
        .tile__footer:focus-visible {
          outline: 3px solid rgba(255, 255, 255, 0.7);
          outline-offset: -3px;
        }

        .tile--disabled {
          cursor: default;
          filter: grayscale(0.12) saturate(0.7);
          opacity: 0.78;
        }

        .tile__main:disabled,
        .tile__footer:disabled {
          cursor: default;
        }

        .tile__body {
          position: relative;
          display: grid;
          align-content: space-between;
          gap: 16px;
          padding: 20px 20px 12px;
          min-height: 0;
        }

        .tile__label {
          position: relative;
          z-index: 1;
          font-size: clamp(13px, 1.6vw, 17px);
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: 0.01em;
          text-transform: none;
        }

        .tile__value {
          position: relative;
          z-index: 1;
          font-size: clamp(2rem, 5vw, 3.6rem);
          line-height: 0.95;
          font-weight: 900;
          letter-spacing: -0.04em;
          text-wrap: balance;
        }

        .tile__icon {
          position: absolute;
          right: -67px;
          top: 50%;
          transform: translateY(-50%);
          --mdc-icon-size: 19.6rem;
          width: 19.6rem;
          height: 19.6rem;
          opacity: 0.13;
          pointer-events: none;
        }

        .tile__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
          min-height: 34px;
          padding: 7px 16px 8px;
          background: var(--tile-footer);
        }

        .tile__footer-text {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 0.95rem;
          font-weight: 700;
          opacity: 0.72;
        }

        .tile__arrow {
          flex: 0 0 auto;
          opacity: 0.58;
        }

        .card--compact .tile {
          min-height: 118px;
        }

        .card--compact .tile__body {
          gap: 10px;
          padding: 14px 16px 8px;
        }

        .card--compact .tile__value {
          font-size: clamp(1.65rem, 4vw, 2.2rem);
        }

        .card--compact .tile__icon {
          right: -56px;
          top: 50%;
          transform: translateY(-50%);
          --mdc-icon-size: 15.4rem;
          width: 15.4rem;
          height: 15.4rem;
          opacity: 0.12;
        }

        .card--compact .tile__footer {
          min-height: 24px;
          padding: 5px 12px 6px;
        }

        .card--compact .tile__footer-text {
          font-size: 0.82rem;
        }

        @media (max-width: 480px) {
          .card {
            padding: 12px;
            gap: 12px;
          }

          .grid {
            gap: 12px;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          }

          .tile {
            min-height: 168px;
          }

          .tile__body {
            padding: 16px 16px 10px;
          }

          .tile__footer {
            min-height: 32px;
            padding: 6px 12px 7px;
          }

          .card--compact .tile {
            min-height: 108px;
          }
        }

        @media (max-width: 450px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;

    this._attachEvents();
  }
}

class PiHoleSlimCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._initialized = false;
  }

  setConfig(config) {
    this._config = normalizeConfig(config);
    this._renderIfNeeded();
    this._syncValues();
    this._syncHass();
  }

  set hass(hass) {
    this._hass = hass;
    this._syncHass();
  }

  _emitConfig() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        bubbles: true,
        composed: true,
        detail: { config: this._config },
      }),
    );
  }

  _getEventValue(event) {
    if (Object.hasOwn(event?.detail || {}, "value")) {
      return event.detail.value ?? "";
    }

    return event?.target?.value ?? "";
  }

  _updateTitle(value) {
    this._config = {
      ...this._config,
      title: value,
    };
    this._emitConfig();
  }

  _updatePiHoleUrl(value) {
    this._config = {
      ...this._config,
      pi_hole_url: value,
    };
    this._emitConfig();
  }

  _updateSection(key, field, value) {
    this._config = {
      ...this._config,
      sections: this._config.sections.map((section) => {
        if (section.key !== key) return section;
        return {
          ...section,
          [field]: value,
        };
      }),
    };
    this._emitConfig();
  }

  _updateSize(value) {
    this._config = {
      ...this._config,
      size: value === "compact" ? "compact" : "large",
    };
    this._emitConfig();
  }

  _renderIfNeeded() {
    if (!this.shadowRoot || this._initialized) return;

    this.shadowRoot.innerHTML = `
      <div class="editor">
        <ha-textfield id="title" label="Card title (optional)"></ha-textfield>
        <ha-textfield id="pi_hole_url" label="Pi-hole URL (for long press)"></ha-textfield>
        <ha-selector id="size"></ha-selector>
        <div class="editor-section">
          <div class="editor-section__title">Widgets</div>
          ${SECTION_DEFINITIONS.map((definition) => `
            <ha-expansion-panel outlined>
              <div slot="header" class="panel-header">
                <span class="panel-header__title" data-panel-title="${definition.key}">${definition.label}</span>
              </div>
              <div class="panel-grid">
                <div class="field-label">Source entity</div>
                <ha-selector
                  data-key="${definition.key}"
                  data-field="entity"
                  data-selector-type="entity"
                ></ha-selector>
                <ha-textfield
                  data-key="${definition.key}"
                  data-field="unit"
                  label="Unit override"
                ></ha-textfield>
                <div class="field-label">Sub entity</div>
                <ha-selector
                  data-key="${definition.key}"
                  data-field="sub_entity"
                  data-selector-type="sub_entity"
                ></ha-selector>
                <ha-textfield
                  data-key="${definition.key}"
                  data-field="sub_unit"
                  label="Unit override"
                ></ha-textfield>
                <div class="field-label">Card</div>
                <ha-textfield
                  data-key="${definition.key}"
                  data-field="name"
                  label="Label override"
                ></ha-textfield>
                <ha-selector
                  data-key="${definition.key}"
                  data-field="icon"
                  data-selector-type="icon"
                ></ha-selector>
              </div>
            </ha-expansion-panel>
          `).join("")}
        </div>
        <div class="editor-version">Editor bundle ${CARD_VERSION}</div>
      </div>
      <style>
        .editor {
          display: grid;
          gap: 16px;
          padding: 8px 0;
        }

        .editor-section {
          display: grid;
          gap: 12px;
        }

        .editor-section__title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }

        ha-expansion-panel {
          --expansion-panel-content-padding: 0 0 12px 0;
        }

        .panel-header {
          display: flex;
          align-items: center;
          width: 100%;
        }

        .panel-header__title {
          font-size: 13px;
          font-weight: 700;
        }

        .panel-grid {
          display: grid;
          gap: 12px;
          padding-top: 10px;
        }

        .field-label {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }

        .editor-version {
          font-size: 12px;
          color: var(--secondary-text-color);
          opacity: 0.8;
          text-align: right;
        }
      </style>
    `;

    this._titleField = this.shadowRoot.querySelector("#title");
    this._piHoleUrlField = this.shadowRoot.querySelector("#pi_hole_url");
    this._sizeField = this.shadowRoot.querySelector("#size");
    this._fields = Array.from(this.shadowRoot.querySelectorAll("[data-field]"));

    if (this._titleField) {
      this._titleField.addEventListener("input", (event) => {
        this._updateTitle(this._getEventValue(event));
      });
    }

    if (this._piHoleUrlField) {
      this._piHoleUrlField.addEventListener("input", (event) => {
        this._updatePiHoleUrl(this._getEventValue(event));
      });
    }

    if (this._sizeField) {
      this._sizeField.selector = {
        select: {
          mode: "dropdown",
          options: [
            { value: "large", label: "Large" },
            { value: "compact", label: "Compact" },
          ],
        },
      };
      this._sizeField.label = "Tile height";
      this._sizeField.addEventListener("value-changed", (event) => {
        this._updateSize(this._getEventValue(event));
      });
    }

    this._configureSelectors();

    this._fields.forEach((field) => {
      const eventName = field.tagName.toLowerCase() === "ha-selector" ? "value-changed" : "input";
      field.addEventListener(eventName, (event) => {
        this._updateSection(field.dataset.key, field.dataset.field, this._getEventValue(event));
      });
    });

    this._initialized = true;
  }

  _configureSelectors() {
    this.shadowRoot.querySelectorAll('[data-selector-type="entity"]').forEach((field) => {
      field.selector = { entity: {} };
      field.label = "";
      field.required = false;
      field.clearable = true;
    });

    this.shadowRoot.querySelectorAll('[data-selector-type="icon"]').forEach((field) => {
      field.selector = { icon: {} };
      field.label = "";
    });

    this.shadowRoot.querySelectorAll('[data-selector-type="sub_entity"]').forEach((field) => {
      field.selector = { entity: {} };
      field.label = "";
      field.required = false;
      field.clearable = true;
    });
  }

  _syncHass() {
    if (!this._hass || !this.shadowRoot) return;

    if (this._titleField) {
      this._titleField.hass = this._hass;
    }

    if (this._piHoleUrlField) {
      this._piHoleUrlField.hass = this._hass;
    }

    if (this._sizeField) {
      this._sizeField.hass = this._hass;
    }

    this._fields?.forEach((field) => {
      field.hass = this._hass;
    });
  }

  _syncValues() {
    if (!this._config || !this.shadowRoot) return;

    if (this._titleField && this._titleField.value !== this._config.title) {
      this._titleField.value = this._config.title || "";
    }

    if (this._piHoleUrlField && this._piHoleUrlField.value !== this._config.pi_hole_url) {
      this._piHoleUrlField.value = this._config.pi_hole_url || "";
    }

    if (this._sizeField && this._sizeField.value !== this._config.size) {
      this._sizeField.value = this._config.size || "large";
    }

    this._fields?.forEach((field) => {
      const section = this._config.sections.find((item) => item.key === field.dataset.key);
      const nextValue = section?.[field.dataset.field] ?? "";
      if (field.value !== nextValue) {
        field.value = nextValue;
      }
    });

    SECTION_DEFINITIONS.forEach((definition) => {
      const titleEl = this.shadowRoot.querySelector(`[data-panel-title="${definition.key}"]`);
      const section = this._config.sections.find((item) => item.key === definition.key);
      const nextTitle = section?.name || definition.label;

      if (titleEl && titleEl.textContent !== nextTitle) {
        titleEl.textContent = nextTitle;
      }
    });
  }
}

if (!customElements.get("pi-hole-slim-card")) {
  customElements.define("pi-hole-slim-card", PiHoleSlimCard);
}

if (!customElements.get("pi-hole-slim-card-editor")) {
  customElements.define("pi-hole-slim-card-editor", PiHoleSlimCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "pi-hole-slim-card",
  name: "Pi-hole Slim Card",
  description: "Pi-hole style four-stat card with a built-in visual editor.",
});
