(() => {
  "use strict";

  const WORLD_SIZE = 2048;

  // Phaser field renderer settings. These values only affect the Canvas/WebGL
  // representation; game rules and state remain in index.html.
  const FIELD_RENDER_CONFIG = Object.freeze({
    canvasZIndex: 2,
    structureNightTint: 0x8194b0,
    entityNightTint: 0x8ba2c3,
    dogUnderTreeTint: 0xd1d1d1
  });

  const ASSET_PATHS = Object.freeze({
    house: "images/house_1.png",
    houseLight: "images/house_1_light.png",
    shed: "images/shed_1.png",
    fence: "images/fence_1.png",
    walls: "images/house_1_walls.png",
    roof: "images/house_1_roof.png",
    garden: "images/garden_1.png",
    mailbox: "images/mailbox.png",
    carWhite: "images/car.png",
    carBlack: "images/car_black.png",
    carBlue: "images/car_blue.png",
    carGreen: "images/car_green.png",
    carRed: "images/car_red.png",
    carYellow: "images/car_yellow.png",
    stumpAxe: "images/bg_stump_axe.png",
    stumpEmpty: "images/bg_stump.png",
    tree1: "images/bg_tree.png",
    tree2: "images/bg_tree_2.png",
    tree3: "images/bg_tree_3.png",
    zombieWalk: "images/zomebie_default_walk.png",
    zombieDead: "images/zomebie_default_dead.png",
    zombieDeadNoHead: "images/zomebie_default_dead_nohead.png",
    zombieDeathNoHead: "images/zomebie_default_death_nohead.png",
    zombieBirthDeath: "images/zomebie_default_birthdeath.png",
    deer: "images/deer_default.png",
    dog: "images/dog_default.png",
    cat: "images/cat_default.png",
    supplyBox: "images/supplybox.png",
    supplyBoxBroken: "images/supplybox_broken.png"
  });

  const pathToKey = new Map(
    Object.entries(ASSET_PATHS).map(([key, path]) => [normalizePath(path), key])
  );

  const staticDefinitions = Object.freeze([
    { id: "houseObject", key: "house", source: "::before", depth: 3 },
    { id: "wallsObject", key: "walls", source: "::before", depth: 4 },
    { id: "roofObject", key: "roof", source: "::before", depth: 5 },
    { id: "fenceObject", key: "fence", source: "::before", depth: 6 },
    { id: "gardenObject", key: "garden", source: "::before", depth: 7 },
    { id: "houseLightObject", key: "houseLight", source: null, depth: 8, light: true },
    { id: "mailboxObject", key: "mailbox", source: "::before", depth: 9 },
    { id: "shedObject", key: "shed", source: "::before", depth: 11 },
    { id: "tree", key: "tree1", sourceElementId: "treeDayVisual", depth: 13, tree: true },
    { id: "carObject", key: "carWhite", source: "::before", depth: 15, car: true },
    { id: "axeStump", key: "stumpAxe", source: "::before", depth: 2.5 }
  ]);

  function normalizePath(value) {
    const cleaned = String(value || "")
      .replace(/^url\(["']?/, "")
      .replace(/["']?\)$/, "")
      .replace(/\\/g, "/")
      .split(/[?#]/)[0];
    const imagesIndex = cleaned.lastIndexOf("/images/");
    if (imagesIndex >= 0) return cleaned.slice(imagesIndex + 1);
    const directImagesIndex = cleaned.indexOf("images/");
    if (directImagesIndex >= 0) return cleaned.slice(directImagesIndex);
    return cleaned.replace(/^https?:\/\/[^/]+\//, "").replace(/^\.\//, "");
  }

  function extractBackgroundUrl(value) {
    const text = String(value || "").trim();
    if (!text || text === "none") return "";
    const match = text.match(/url\(["']?([^"')]+)["']?\)/i);
    return normalizePath(match ? match[1] : text);
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function mixChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function mixColor(from, to, t) {
    const amount = clamp01(t);
    const fr = (from >> 16) & 0xff;
    const fg = (from >> 8) & 0xff;
    const fb = from & 0xff;
    const tr = (to >> 16) & 0xff;
    const tg = (to >> 8) & 0xff;
    const tb = to & 0xff;
    return (
      (mixChannel(fr, tr, amount) << 16) |
      (mixChannel(fg, tg, amount) << 8) |
      mixChannel(fb, tb, amount)
    );
  }

  function numberFromPx(value, fallback = 0) {
    const parsed = parseFloat(String(value || ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function resolveSizeToken(token, hostSize, textureSize) {
    const text = String(token || "auto").trim().toLowerCase();
    if (!text || text === "auto") return textureSize;
    if (text.endsWith("%")) {
      return hostSize * numberFromPx(text, 100) / 100;
    }
    if (text.endsWith("px") || /^-?\d+(?:\.\d+)?$/.test(text)) {
      return numberFromPx(text, textureSize);
    }
    return textureSize;
  }

  function parseBackgroundSize(value, hostWidth, hostHeight, textureWidth, textureHeight) {
    const text = String(value || "auto").trim().toLowerCase();
    if (text === "cover" || text === "contain") {
      const scale = text === "cover"
        ? Math.max(hostWidth / textureWidth, hostHeight / textureHeight)
        : Math.min(hostWidth / textureWidth, hostHeight / textureHeight);
      return {
        width: textureWidth * scale,
        height: textureHeight * scale
      };
    }

    const parts = text.split(/\s+/).filter(Boolean);
    const first = parts[0] || "auto";
    const second = parts[1] || "auto";
    let width = resolveSizeToken(first, hostWidth, textureWidth);
    let height = resolveSizeToken(second, hostHeight, textureHeight);

    if (first === "auto" && second !== "auto") {
      width = height * textureWidth / textureHeight;
    } else if (second === "auto" && first !== "auto") {
      height = width * textureHeight / textureWidth;
    }

    return {
      width: Math.max(0.0001, width),
      height: Math.max(0.0001, height)
    };
  }

  function keywordToPercent(token, axis) {
    const text = String(token || "").toLowerCase();
    if (text === "center") return "50%";
    if (axis === "x") {
      if (text === "left") return "0%";
      if (text === "right") return "100%";
    } else {
      if (text === "top") return "0%";
      if (text === "bottom") return "100%";
    }
    return token;
  }

  function resolvePositionToken(token, hostSize, backgroundSize, axis) {
    const normalized = keywordToPercent(token, axis);
    const text = String(normalized || "0%").trim();
    if (text.endsWith("%")) {
      return (hostSize - backgroundSize) * numberFromPx(text, 0) / 100;
    }
    return numberFromPx(text, 0);
  }

  function parseBackgroundPosition(value, hostWidth, hostHeight, backgroundWidth, backgroundHeight) {
    let parts = String(value || "0% 0%").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      if (["top", "bottom"].includes(parts[0].toLowerCase())) {
        parts = ["50%", parts[0]];
      } else {
        parts = [parts[0], "50%"];
      }
    }
    const xToken = parts[0] || "0%";
    const yToken = parts[1] || "0%";
    return {
      x: resolvePositionToken(xToken, hostWidth, backgroundWidth, "x"),
      y: resolvePositionToken(yToken, hostHeight, backgroundHeight, "y")
    };
  }

  function parseTranslate(transform) {
    const text = String(transform || "");
    const translate = text.match(/translate3d\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/i)
      || text.match(/translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/i);
    if (translate) {
      return { x: Number(translate[1]) || 0, y: Number(translate[2]) || 0 };
    }
    const matrix = text.match(/matrix\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*\)/i);
    if (matrix) {
      return { x: Number(matrix[1]) || 0, y: Number(matrix[2]) || 0 };
    }
    return { x: 0, y: 0 };
  }

  // Phaser shares the same 2048x2048 coordinate space as #world.
  // Never derive world coordinates from getBoundingClientRect(): that value
  // already contains the start-screen zoom, world pan and browser transforms.
  // Reading those screen-space values and converting them back caused the
  // Phaser field to drift and shrink depending on the serving environment.
  function getOffsetWithinWorld(element) {
    const world = document.getElementById("world");
    if (!element || !world) return null;

    let left = 0;
    let top = 0;
    let node = element;
    while (node && node !== world) {
      left += Number(node.offsetLeft) || 0;
      top += Number(node.offsetTop) || 0;
      node = node.offsetParent;
    }
    if (node !== world) return null;
    return { left, top };
  }

  function readTransformComponents(element) {
    const result = { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 };
    if (!element) return result;

    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return result;

    try {
      const MatrixCtor = window.DOMMatrixReadOnly || window.DOMMatrix || window.WebKitCSSMatrix;
      if (MatrixCtor) {
        const matrix = new MatrixCtor(transform);
        result.translateX = Number(matrix.m41 ?? matrix.e) || 0;
        result.translateY = Number(matrix.m42 ?? matrix.f) || 0;
        result.scaleX = Math.hypot(Number(matrix.m11 ?? matrix.a) || 0, Number(matrix.m12 ?? matrix.b) || 0) || 1;
        result.scaleY = Math.hypot(Number(matrix.m21 ?? matrix.c) || 0, Number(matrix.m22 ?? matrix.d) || 0) || 1;
        return result;
      }
    } catch (_) {
      // Fall through to the lightweight matrix parser below.
    }

    const matrix3d = String(transform).match(/^matrix3d\((.+)\)$/i);
    if (matrix3d) {
      const values = matrix3d[1].split(",").map((value) => Number(value.trim()) || 0);
      if (values.length === 16) {
        result.scaleX = Math.hypot(values[0], values[1]) || 1;
        result.scaleY = Math.hypot(values[4], values[5]) || 1;
        result.translateX = values[12] || 0;
        result.translateY = values[13] || 0;
      }
      return result;
    }

    const matrix = String(transform).match(/^matrix\((.+)\)$/i);
    if (matrix) {
      const values = matrix[1].split(",").map((value) => Number(value.trim()) || 0);
      if (values.length === 6) {
        result.scaleX = Math.hypot(values[0], values[1]) || 1;
        result.scaleY = Math.hypot(values[2], values[3]) || 1;
        result.translateX = values[4] || 0;
        result.translateY = values[5] || 0;
      }
    }
    return result;
  }

  function getStaticWorldRect(element) {
    const offset = getOffsetWithinWorld(element);
    if (!offset) return null;
    const transform = readTransformComponents(element);
    const width = (Number(element.offsetWidth) || 0) * transform.scaleX;
    const height = (Number(element.offsetHeight) || 0) * transform.scaleY;
    const left = offset.left + transform.translateX;
    const top = offset.top + transform.translateY;
    return {
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2
    };
  }

  function getEntityWorldRect(element) {
    if (!element) return null;
    const width = Number(element.offsetWidth) || numberFromPx(getComputedStyle(element).width, 0);
    const height = Number(element.offsetHeight) || numberFromPx(getComputedStyle(element).height, 0);

    // Entity left/top are intentionally their center coordinates. The DOM uses
    // translate(-50%, -50%) only as a visual positioning trick; Phaser should
    // not read that transform back into the coordinates.
    const centerX = numberFromPx(element.style.left, Number(element.offsetLeft) || 0);
    const centerY = numberFromPx(element.style.top, Number(element.offsetTop) || 0);
    return {
      left: centerX - width / 2,
      top: centerY - height / 2,
      width,
      height,
      centerX,
      centerY
    };
  }

  function getTopLeftWorldRect(element) {
    if (!element) return null;
    const offset = getOffsetWithinWorld(element);
    if (!offset) return null;
    const width = Number(element.offsetWidth) || numberFromPx(getComputedStyle(element).width, 0);
    const height = Number(element.offsetHeight) || numberFromPx(getComputedStyle(element).height, 0);
    return {
      left: offset.left,
      top: offset.top,
      width,
      height,
      centerX: offset.left + width / 2,
      centerY: offset.top + height / 2
    };
  }

  function getRootNightMix() {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--scene-night-mix");
    return clamp01(parseFloat(value));
  }

  function getLayerBaseDepth(parentId) {
    switch (parentId) {
      case "entitiesBehindShed": return 10;
      case "entitiesBehindTree": return 12;
      case "entities": return 14;
      case "entitiesFrontStructures": return 16;
      case "supplyBoxLayer": return 18.8;
      case "supplyBoxShadowLayer": return 1;
      default: return 14;
    }
  }

  function getDomEntityAlpha(element) {
    if (!element) return 0;
    const inline = element.style.opacity;
    if (inline !== "") return clamp01(parseFloat(inline));
    if (element.classList.contains("is-appearing")) return 0;
    return 1;
  }

  function getDomChildAlpha(element, defaultValue) {
    if (!element) return 0;
    const inline = element.style.opacity;
    if (inline === "") return defaultValue;
    return clamp01(parseFloat(inline));
  }

  function roundedFrameToken(value) {
    const number = Math.round((Number(value) || 0) * 1000) / 1000;
    return String(number).replace(/-/g, "m").replace(/\./g, "p");
  }

  function ensureTextureFrame(scene, textureKey, x, y, width, height) {
    const texture = scene?.textures?.get?.(textureKey);
    if (!texture) return null;
    const baseFrame = texture.get();
    const sourceWidth = Number(baseFrame?.width) || Number(texture.source?.[0]?.width) || 0;
    const sourceHeight = Number(baseFrame?.height) || Number(texture.source?.[0]?.height) || 0;
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;

    const frameX = Math.max(0, Math.min(sourceWidth, Number(x) || 0));
    const frameY = Math.max(0, Math.min(sourceHeight, Number(y) || 0));
    const frameWidth = Math.max(0.0001, Math.min(sourceWidth - frameX, Number(width) || sourceWidth));
    const frameHeight = Math.max(0.0001, Math.min(sourceHeight - frameY, Number(height) || sourceHeight));

    const isBaseFrame =
      Math.abs(frameX) < 0.0001 &&
      Math.abs(frameY) < 0.0001 &&
      Math.abs(frameWidth - sourceWidth) < 0.0001 &&
      Math.abs(frameHeight - sourceHeight) < 0.0001;
    if (isBaseFrame) return baseFrame.name;

    const frameName = [
      "cozzy",
      roundedFrameToken(frameX),
      roundedFrameToken(frameY),
      roundedFrameToken(frameWidth),
      roundedFrameToken(frameHeight)
    ].join("_");

    if (!texture.frames?.[frameName]) {
      texture.add(frameName, 0, frameX, frameY, frameWidth, frameHeight);
    }
    return frameName;
  }

  function applyTextureFrame(scene, sprite, textureKey, x, y, width, height) {
    const frameName = ensureTextureFrame(scene, textureKey, x, y, width, height);
    if (frameName == null) return false;
    sprite.setCrop();
    sprite.setTexture(textureKey, frameName);
    return true;
  }

  class CozzyFieldScene extends Phaser.Scene {
    constructor() {
      super("CozzyField");
      this.staticSprites = new Map();
      this.entityMirrors = new Map();
      this.supplyMirrors = new Map();
      this.supplyShadowMirrors = new Map();
      this.lastNightMix = -1;
      this.entityScanDirty = true;
      this.supplyScanDirty = true;
      this.lastEntityScanAt = -Infinity;
      this.lastSupplyScanAt = -Infinity;
      this.worldMutationObserver = null;
    }

    preload() {
      for (const [key, path] of Object.entries(ASSET_PATHS)) {
        this.load.image(key, path);
      }
    }

    create() {
      this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");

      // Asset loading can fail when a project is opened in an environment that
      // blocks local image loading. In that case keep the original DOM visuals
      // active instead of hiding them behind an incomplete Phaser renderer.
      const requiredCoreTextures = [
        "house",
        "shed",
        "tree1",
        "carWhite",
        "zombieBirthDeath",
        "deer",
        "dog",
        "cat"
      ];
      const hasCoreTextures = requiredCoreTextures.every((key) =>
        this.textures.exists(key)
      );
      if (!hasCoreTextures) {
        document.body.classList.add("phaser-field-failed");
        window.dispatchEvent(new CustomEvent("cozzy:phaser-field-failed"));
        this.scene.pause();
        return;
      }

      this.createStaticSprites();
      const world = document.getElementById("world");
      if (world && typeof MutationObserver !== "undefined") {
        this.worldMutationObserver = new MutationObserver(() => {
          this.entityScanDirty = true;
          this.supplyScanDirty = true;
        });
        this.worldMutationObserver.observe(world, { childList: true, subtree: true });
      }
      document.body.classList.add("phaser-field-ready");
      window.dispatchEvent(new CustomEvent("cozzy:phaser-field-ready"));
    }

    createStaticSprites() {
      for (const definition of staticDefinitions) {
        const sprite = this.add.image(0, 0, definition.key)
          .setOrigin(0, 0)
          .setDepth(definition.depth)
          .setVisible(false);
        this.staticSprites.set(definition.id, { definition, sprite });
      }
    }

    update() {
      const nightMix = getRootNightMix();
      this.syncStaticSprites(nightMix);
      this.syncEntities(nightMix);
      this.syncSupplyBoxes(nightMix);
    }

    syncStaticSprites(nightMix) {
      for (const { definition, sprite } of this.staticSprites.values()) {
        const element = document.getElementById(definition.id);
        if (!element || !element.isConnected) {
          sprite.setVisible(false);
          continue;
        }

        if (definition.light) {
          this.syncHouseLight(element, sprite);
          continue;
        }

        const computed = getComputedStyle(element);
        const shouldShow = !element.hidden && computed.display !== "none" && computed.visibility !== "hidden";
        if (!shouldShow) {
          sprite.setVisible(false);
          continue;
        }

        const visualRect = getStaticWorldRect(element);
        if (!visualRect || visualRect.width <= 0 || visualRect.height <= 0) {
          sprite.setVisible(false);
          continue;
        }

        let sourceStyle;
        const cropHostWidth = element.offsetWidth;
        const cropHostHeight = element.offsetHeight;
        const displayWidth = visualRect.width;
        const displayHeight = visualRect.height;

        if (definition.sourceElementId) {
          const sourceElement = document.getElementById(definition.sourceElementId);
          if (!sourceElement) {
            sprite.setVisible(false);
            continue;
          }
          sourceStyle = getComputedStyle(sourceElement);
        } else {
          sourceStyle = getComputedStyle(element, definition.source || null);
        }

        const backgroundUrl = extractBackgroundUrl(sourceStyle.backgroundImage);
        const key = pathToKey.get(backgroundUrl) || definition.key;
        if (!this.textures.exists(key)) {
          sprite.setVisible(false);
          continue;
        }

        sprite.setTexture(key);
        this.applyBackgroundCrop(
          sprite,
          sourceStyle,
          cropHostWidth,
          cropHostHeight,
          displayWidth,
          displayHeight
        );

        sprite.setPosition(visualRect.left, visualRect.top);
        sprite.setDepth(definition.depth);
        sprite.setAlpha(1);
        sprite.setTint(mixColor(0xffffff, FIELD_RENDER_CONFIG.structureNightTint, nightMix));
        sprite.setVisible(true);
      }
    }

    syncHouseLight(element, sprite) {
      const isOn = element.classList.contains("is-on") && !element.hidden;
      if (!isOn) {
        sprite.setVisible(false);
        return;
      }
      const style = getComputedStyle(element);
      const backgroundUrl = extractBackgroundUrl(style.backgroundImage);
      const key = pathToKey.get(backgroundUrl) || "houseLight";
      if (!this.textures.exists(key)) {
        sprite.setVisible(false);
        return;
      }
      const visualRect = getStaticWorldRect(element);
      if (!visualRect || visualRect.width <= 0 || visualRect.height <= 0) {
        sprite.setVisible(false);
        return;
      }
      sprite.setTexture(key);
      sprite.setPosition(visualRect.left, visualRect.top);
      sprite.setDisplaySize(visualRect.width, visualRect.height);
      sprite.setCrop();
      sprite.clearTint();
      sprite.setVisible(true);
    }

    applyBackgroundCrop(sprite, style, hostWidth, hostHeight, displayWidth, displayHeight) {
      const texture = sprite.texture?.source?.[0];
      const textureWidth = Number(texture?.width) || Number(sprite.width) || hostWidth;
      const textureHeight = Number(texture?.height) || Number(sprite.height) || hostHeight;
      const backgroundSize = parseBackgroundSize(
        style.backgroundSize,
        hostWidth,
        hostHeight,
        textureWidth,
        textureHeight
      );
      const backgroundPosition = parseBackgroundPosition(
        style.backgroundPosition,
        hostWidth,
        hostHeight,
        backgroundSize.width,
        backgroundSize.height
      );

      const ratioX = textureWidth / backgroundSize.width;
      const ratioY = textureHeight / backgroundSize.height;
      const cropX = Math.max(0, -backgroundPosition.x * ratioX);
      const cropY = Math.max(0, -backgroundPosition.y * ratioY);
      const cropWidth = Math.min(textureWidth - cropX, hostWidth * ratioX);
      const cropHeight = Math.min(textureHeight - cropY, hostHeight * ratioY);

      if (
        Number.isFinite(cropWidth) && cropWidth > 0 &&
        Number.isFinite(cropHeight) && cropHeight > 0
      ) {
        // Use a real Phaser Texture Frame instead of setCrop(). Crop only clips
        // a Game Object and deliberately does NOT change its intrinsic size.
        // Using setDisplaySize after setCrop therefore scaled the full source
        // texture and made 2x2 / sprite-sheet frames appear too small and offset.
        const key = sprite.texture?.key;
        if (key) {
          applyTextureFrame(this, sprite, key, cropX, cropY, cropWidth, cropHeight);
        }
      } else {
        sprite.setCrop();
      }
      sprite.setDisplaySize(displayWidth, displayHeight);
    }

    syncEntities(nightMix) {
      const now = performance.now();
      if (this.entityScanDirty || now - this.lastEntityScanAt >= 500) {
        this.entityScanDirty = false;
        this.lastEntityScanAt = now;
        const elements = document.querySelectorAll(".zombie, .deer, .dog, .cat");
        const active = new Set(elements);

        for (const element of elements) {
          if (this.entityMirrors.has(element)) continue;
          const mirror = this.createEntityMirror(element);
          if (mirror) this.entityMirrors.set(element, mirror);
        }

        for (const [element, mirror] of this.entityMirrors) {
          if (active.has(element) && element.isConnected) continue;
          this.destroyEntityMirror(mirror);
          this.entityMirrors.delete(element);
        }
      }

      for (const [element, mirror] of this.entityMirrors) {
        if (!element.isConnected) continue;
        this.updateEntityMirror(element, mirror, nightMix);
      }
    }

    getEntityType(element) {
      if (element.classList.contains("zombie")) return "zombie";
      if (element.classList.contains("deer")) return "deer";
      if (element.classList.contains("dog")) return "dog";
      if (element.classList.contains("cat")) return "cat";
      return "";
    }

    createEntityMirror(element) {
      const type = this.getEntityType(element);
      if (!type) return null;
      const fallbackKey = type === "zombie" ? "zombieBirthDeath" : type;
      // Keep both images hidden until a valid frame has been resolved. Otherwise
      // Phaser can briefly render the entire sprite sheet before the first sync.
      const base = this.add.image(0, 0, fallbackKey)
        .setOrigin(0.5, 0.5)
        .setVisible(false);
      const overlay = this.add.image(0, 0, fallbackKey)
        .setOrigin(0.5, 0.5)
        .setVisible(false);
      const shadow = this.add.ellipse(0, 0, 48, 8, 0x000000, 0.18)
        .setOrigin(0.5, 0.5)
        .setVisible(false);
      const fallbackWidth = type === "zombie" ? 64 : type === "deer" ? 512 / 6 : 64;
      const fallbackHeight = type === "zombie" ? 128 : type === "deer" ? 512 / 6 : 64;
      return {
        type,
        base,
        overlay,
        shadow,
        fallbackWidth,
        fallbackHeight
      };
    }

    destroyEntityMirror(mirror) {
      mirror.base?.destroy();
      mirror.overlay?.destroy();
      mirror.shadow?.destroy();
    }

    updateEntityMirror(element, mirror, nightMix) {
      const visualRect = getEntityWorldRect(element);
      if (!visualRect || visualRect.width <= 0 || visualRect.height <= 0) {
        mirror.base.setVisible(false);
        mirror.overlay.setVisible(false);
        mirror.shadow.setVisible(false);
        return;
      }
      const x = visualRect.centerX;
      const y = visualRect.centerY;
      const rootAlpha = getDomEntityAlpha(element);
      const sortY = numberFromPx(element.style.zIndex, y);
      const baseDepth = getLayerBaseDepth(element.parentElement?.id);
      const depth = baseDepth + Math.max(0, Math.min(9999, sortY)) / 10000;
      const width = visualRect.width || mirror.fallbackWidth;
      const height = visualRect.height || mirror.fallbackHeight;

      mirror.base.setPosition(x, y).setDepth(depth + 0.002);
      mirror.overlay.setPosition(x, y).setDepth(depth + 0.003);

      let spriteElement = null;
      let overlayElement = null;
      if (mirror.type === "zombie") {
        spriteElement = element.querySelector(".zombie-visual-day .zombie-sprite");
        overlayElement = element.querySelector(".zombie-visual-day .zombie-sprite-overlay");
      } else if (mirror.type === "deer") {
        spriteElement = element.querySelector(".deer-visual-day .deer-sprite");
        overlayElement = element.querySelector(".deer-visual-day .deer-sprite-overlay");
      } else if (mirror.type === "dog") {
        spriteElement = element.querySelector(".dog-visual-day .dog-sprite");
      } else if (mirror.type === "cat") {
        spriteElement = element.querySelector(".cat-visual-day .cat-sprite");
      }

      const baseSpriteReady = this.syncEntitySprite(
        mirror.base,
        spriteElement,
        mirror.type,
        width,
        height
      );
      if (!baseSpriteReady) {
        mirror.base.setVisible(false);
        mirror.overlay.setVisible(false);
        mirror.shadow.setVisible(false);
        return;
      }

      this.syncEntityShadow(element, mirror, x, y, width, height, depth, rootAlpha);
      const baseAlpha = getDomChildAlpha(spriteElement, 1);
      mirror.base.setAlpha(rootAlpha * baseAlpha);

      if (overlayElement) {
        const overlayAlpha = getDomChildAlpha(overlayElement, 0);
        if (overlayAlpha > 0.0001 && this.syncEntitySprite(mirror.overlay, overlayElement, mirror.type, width, height)) {
          mirror.overlay.setAlpha(rootAlpha * overlayAlpha).setVisible(true);
        } else {
          mirror.overlay.setVisible(false);
        }
      } else {
        mirror.overlay.setVisible(false);
      }

      let targetTint = FIELD_RENDER_CONFIG.entityNightTint;
      let tintMix = nightMix;
      if (mirror.type === "dog" && element.classList.contains("is-under-tree")) {
        const underTree = mixColor(0xffffff, FIELD_RENDER_CONFIG.dogUnderTreeTint, 1);
        targetTint = mixColor(underTree, FIELD_RENDER_CONFIG.entityNightTint, nightMix);
        tintMix = 1;
      }
      const tint = tintMix >= 1
        ? targetTint
        : mixColor(0xffffff, targetTint, tintMix);
      mirror.base.setTint(tint);
      mirror.overlay.setTint(tint);

      const isVisible = baseSpriteReady && rootAlpha > 0.0001 && !element.hidden;
      mirror.base.setVisible(isVisible);
      if (!isVisible) mirror.overlay.setVisible(false);
    }

    syncEntityShadow(element, mirror, x, y, width, height, depth, rootAlpha) {
      let offsetX = 0;
      let offsetY = height * 0.25;
      let shadowWidth = width * 0.85;
      let shadowHeight = Math.max(4, height * 0.055);

      if (mirror.type === "zombie") {
        offsetX = 23;
        offsetY = 31;
        shadowWidth = 70;
        shadowHeight = 6.4;
      } else if (mirror.type === "deer") {
        offsetX = 11.8;
        offsetY = 21.7;
        shadowWidth = 73.3;
        shadowHeight = 5.1;
      } else if (mirror.type === "dog") {
        offsetX = width * 0.19;
        offsetY = height * 0.25;
        shadowWidth = width * 0.9;
        shadowHeight = height * 0.084;
      } else if (mirror.type === "cat") {
        offsetX = width * 0.055;
        offsetY = height * 0.15;
        shadowWidth = width * 0.75;
        shadowHeight = height * 0.084;
      }

      mirror.shadow
        .setPosition(x + offsetX, y + offsetY)
        .setDisplaySize(shadowWidth, shadowHeight)
        .setDepth(depth + 0.001)
        .setAlpha(rootAlpha * 0.2)
        .setVisible(rootAlpha > 0.0001 && !element.hidden);
    }

    syncEntitySprite(sprite, domSprite, type, width, height) {
      if (!domSprite) return false;

      // Mirror the DOM sprite exactly as CSS renders it. The DOM animation code
      // expresses frames through background-size / background-position, and those
      // values are in DISPLAY pixels, not necessarily source-texture pixels.
      // Converting them through the real texture size keeps scaled sheets such as
      // the 76px cat (64px source frames) and percentage-positioned dog accurate.
      const style = getComputedStyle(domSprite);
      const backgroundUrl = extractBackgroundUrl(style.backgroundImage);
      const key = pathToKey.get(backgroundUrl) || (
        type === "zombie" ? "zombieBirthDeath" : type
      );
      if (!key || !this.textures.exists(key)) return false;

      const texture = this.textures.get(key);
      const source = texture?.source?.[0];
      const baseFrame = texture?.get?.();
      const textureWidth = Number(source?.width) || Number(baseFrame?.width) || 0;
      const textureHeight = Number(source?.height) || Number(baseFrame?.height) || 0;
      if (!(textureWidth > 0) || !(textureHeight > 0)) return false;

      const hostWidth = Number(domSprite.offsetWidth) || width;
      const hostHeight = Number(domSprite.offsetHeight) || height;
      if (!(hostWidth > 0) || !(hostHeight > 0)) return false;

      const backgroundSize = parseBackgroundSize(
        style.backgroundSize,
        hostWidth,
        hostHeight,
        textureWidth,
        textureHeight
      );
      if (!(backgroundSize.width > 0) || !(backgroundSize.height > 0)) return false;

      const backgroundPosition = parseBackgroundPosition(
        style.backgroundPosition,
        hostWidth,
        hostHeight,
        backgroundSize.width,
        backgroundSize.height
      );

      // CSS background coordinates refer to the scaled background. Convert the
      // visible DOM rectangle back to source-image pixels before creating a
      // Phaser Texture Frame.
      const ratioX = textureWidth / backgroundSize.width;
      const ratioY = textureHeight / backgroundSize.height;
      let frameX = -backgroundPosition.x * ratioX;
      let frameY = -backgroundPosition.y * ratioY;
      let frameWidth = hostWidth * ratioX;
      let frameHeight = hostHeight * ratioY;

      // Floating-point background math can produce values such as -0.0000001.
      // Clamp only after the CSS-to-source conversion so frame selection itself
      // remains faithful to the DOM version.
      if (Math.abs(frameX) < 0.0001) frameX = 0;
      if (Math.abs(frameY) < 0.0001) frameY = 0;
      frameX = Math.max(0, Math.min(textureWidth, frameX));
      frameY = Math.max(0, Math.min(textureHeight, frameY));
      frameWidth = Math.max(0, Math.min(textureWidth - frameX, frameWidth));
      frameHeight = Math.max(0, Math.min(textureHeight - frameY, frameHeight));

      if (!(frameWidth > 0.01) || !(frameHeight > 0.01)) {
        sprite.setVisible(false);
        return false;
      }

      if (!applyTextureFrame(
        this,
        sprite,
        key,
        frameX,
        frameY,
        frameWidth,
        frameHeight
      )) {
        return false;
      }

      sprite.setDisplaySize(width, height);
      sprite.setFlipX(String(domSprite.style.transform || "").includes("scaleX(-1)"));
      return true;
    }

    syncSupplyBoxes(nightMix) {
      const now = performance.now();
      if (this.supplyScanDirty || now - this.lastSupplyScanAt >= 500) {
        this.supplyScanDirty = false;
        this.lastSupplyScanAt = now;
        this.refreshSupplyCollection(
          document.querySelectorAll(".supply-box"),
          this.supplyMirrors
        );
        this.refreshSupplyCollection(
          document.querySelectorAll(".supply-box-shadow"),
          this.supplyShadowMirrors
        );
      }

      for (const [element, sprite] of this.supplyMirrors) {
        if (element.isConnected) this.updateSupplySprite(element, sprite, false, nightMix);
      }
      for (const [element, sprite] of this.supplyShadowMirrors) {
        if (element.isConnected) this.updateSupplySprite(element, sprite, true, nightMix);
      }
    }

    refreshSupplyCollection(nodeList, mirrorMap) {
      const active = new Set(nodeList);
      for (const element of nodeList) {
        if (mirrorMap.has(element)) continue;
        mirrorMap.set(
          element,
          this.add.image(0, 0, "supplyBox").setOrigin(0, 0)
        );
      }
      for (const [element, sprite] of mirrorMap) {
        if (active.has(element) && element.isConnected) continue;
        sprite.destroy();
        mirrorMap.delete(element);
      }
    }

    updateSupplySprite(element, sprite, isShadow, nightMix) {
      const visualRect = getTopLeftWorldRect(element);
      if (!visualRect || visualRect.width <= 0 || visualRect.height <= 0) {
        sprite.setVisible(false);
        return;
      }
      const width = visualRect.width;
      const height = visualRect.height;
      const x = visualRect.left;
      const y = visualRect.top;
      const alpha = getDomEntityAlpha(element);
      const imagePath = extractBackgroundUrl(
        element.style.getPropertyValue("--supply-box-image") ||
        getComputedStyle(element).getPropertyValue("--supply-box-image")
      );
      const key = pathToKey.get(imagePath) || "supplyBox";
      if (!this.textures.exists(key) || width <= 0 || height <= 0) {
        sprite.setVisible(false);
        return;
      }
      sprite.setTexture(key);

      const fakeStyle = {
        backgroundSize: element.style.getPropertyValue("--supply-box-background-size") || "100% 100%",
        backgroundPosition: element.style.getPropertyValue("--supply-box-background-position") || "0px 0px"
      };
      this.applyBackgroundCrop(sprite, fakeStyle, width, height, width, height);
      sprite.setPosition(x, y);

      const parentId = element.parentElement?.id;
      const sortY = numberFromPx(element.style.zIndex, y + height);
      const depth = isShadow
        ? 1
        : getLayerBaseDepth(parentId) + Math.max(0, Math.min(9999, sortY)) / 10000;
      sprite.setDepth(depth);
      sprite.setAlpha(alpha);
      sprite.setTint(mixColor(0xffffff, FIELD_RENDER_CONFIG.structureNightTint, nightMix));
      sprite.setVisible(alpha > 0.0001);
    }
  }

  const PHASER_RAIN_CONFIG = Object.freeze({
    densityPer10kPx2: 1,
    minimumCount: 300,
    maximumCount: 1200,
    thicknessMinPx: 1,
    thicknessMaxPx: 1.2,
    lengthMinPx: 30,
    lengthMaxPx: 70,
    opacityMin: 0.3,
    opacityMax: 0.7,
    dayAlpha: 0.5,
    nightAlpha: 0.2,
    speedMinPxPerSecond: 900,
    speedMaxPxPerSecond: 1300,
    landingYMinViewportRatio: 0.03,
    landingYMaxViewportRatio: 1.08,
    startYViewportRatio: -0.1,
    layerTopViewportRatio: -0.24,
    horizontalTravelRatioMin: 0,
    horizontalTravelRatioMax: 0.01,
    alphaTransitionMs: 3000,
    color: 0xe1eef8
  });

  function randomRainValue(min, max) {
    return min + Math.random() * (max - min);
  }

  class CozzyWeatherScene extends Phaser.Scene {
    constructor() {
      super("CozzyWeather");
      this.rainGraphics = null;
      this.rainDrops = [];
      this.currentNightAlpha = PHASER_RAIN_CONFIG.dayAlpha;
      this.lastViewportWidth = 0;
      this.lastViewportHeight = 0;
    }

    create() {
      this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
      this.rainGraphics = this.add.graphics().setDepth(1);
      this.currentNightAlpha = document.body.classList.contains("is-night")
        ? PHASER_RAIN_CONFIG.nightAlpha
        : PHASER_RAIN_CONFIG.dayAlpha;
      this.syncRainDropPool(true);

      // Once this renderer is ready, stop the legacy 300~1200 animated DOM nodes.
      window.COZZY_PHASER_RAIN_ENABLED = true;
      const legacyRainLayer = document.getElementById("rainLayer");
      if (legacyRainLayer?.childElementCount) legacyRainLayer.replaceChildren();
      document.body.classList.add("phaser-weather-ready");
      window.dispatchEvent(new CustomEvent("cozzy:phaser-weather-ready"));
    }

    getViewportSize() {
      const canvas = this.game?.canvas;
      return {
        width: Math.max(1, Number(canvas?.width) || window.innerWidth || 1),
        height: Math.max(1, Number(canvas?.height) || window.innerHeight || 1)
      };
    }

    getTargetRainDropCount(width, height) {
      const target = Math.round(
        Math.max(1, width * height) / 10000 * PHASER_RAIN_CONFIG.densityPer10kPx2
      );
      return Math.max(
        PHASER_RAIN_CONFIG.minimumCount,
        Math.min(PHASER_RAIN_CONFIG.maximumCount, target)
      );
    }

    makeRainDrop() {
      const length = randomRainValue(
        PHASER_RAIN_CONFIG.lengthMinPx,
        PHASER_RAIN_CONFIG.lengthMaxPx
      );
      const lengthRange = Math.max(
        1,
        PHASER_RAIN_CONFIG.lengthMaxPx - PHASER_RAIN_CONFIG.lengthMinPx
      );
      return {
        xRatio: randomRainValue(-0.18, 1),
        thickness: randomRainValue(
          PHASER_RAIN_CONFIG.thicknessMinPx,
          PHASER_RAIN_CONFIG.thicknessMaxPx
        ),
        length,
        sizeProgress: Math.max(
          0,
          Math.min(1, (length - PHASER_RAIN_CONFIG.lengthMinPx) / lengthRange)
        ),
        baseOpacity: randomRainValue(
          PHASER_RAIN_CONFIG.opacityMin,
          PHASER_RAIN_CONFIG.opacityMax
        ),
        speed: randomRainValue(
          PHASER_RAIN_CONFIG.speedMinPxPerSecond,
          PHASER_RAIN_CONFIG.speedMaxPxPerSecond
        ),
        horizontalTravelRatio: randomRainValue(
          PHASER_RAIN_CONFIG.horizontalTravelRatioMin,
          PHASER_RAIN_CONFIG.horizontalTravelRatioMax
        ),
        phase: Math.random()
      };
    }

    syncRainDropPool(force = false) {
      const { width, height } = this.getViewportSize();
      if (
        !force &&
        width === this.lastViewportWidth &&
        height === this.lastViewportHeight
      ) {
        return;
      }
      this.lastViewportWidth = width;
      this.lastViewportHeight = height;

      const targetCount = this.getTargetRainDropCount(width, height);
      while (this.rainDrops.length < targetCount) {
        this.rainDrops.push(this.makeRainDrop());
      }
      if (this.rainDrops.length > targetCount) {
        this.rainDrops.length = targetCount;
      }
    }

    update(time, delta) {
      if (!this.rainGraphics) return;
      this.syncRainDropPool(false);

      const isRainy = document.body.classList.contains("is-rainy");
      if (!isRainy) {
        this.rainGraphics.clear();
        return;
      }

      const targetAlpha = document.body.classList.contains("is-night")
        ? PHASER_RAIN_CONFIG.nightAlpha
        : PHASER_RAIN_CONFIG.dayAlpha;
      const instantWeather =
        document.body.classList.contains("is-initializing-weather") ||
        document.body.classList.contains("is-weather-test-instant");
      if (instantWeather) {
        this.currentNightAlpha = targetAlpha;
      } else {
        const progress = Math.max(
          0,
          Math.min(1, (Number(delta) || 0) / PHASER_RAIN_CONFIG.alphaTransitionMs)
        );
        this.currentNightAlpha += (targetAlpha - this.currentNightAlpha) * progress;
      }

      const { width, height } = this.getViewportSize();
      const startY = height * (
        PHASER_RAIN_CONFIG.layerTopViewportRatio +
        PHASER_RAIN_CONFIG.startYViewportRatio
      );
      const now = Number(time) || performance.now();
      const graphics = this.rainGraphics;
      graphics.clear();

      for (const drop of this.rainDrops) {
        const landingRatio =
          PHASER_RAIN_CONFIG.landingYMinViewportRatio +
          (PHASER_RAIN_CONFIG.landingYMaxViewportRatio -
            PHASER_RAIN_CONFIG.landingYMinViewportRatio) *
            drop.sizeProgress;
        const landingY = height * landingRatio;
        const travelY = Math.max(1, landingY - startY - drop.length);
        const durationMs = Math.max(1, travelY / drop.speed * 1000);
        const elapsed = (now + drop.phase * durationMs) % durationMs;
        const progress = elapsed / durationMs;
        const x =
          drop.xRatio * width +
          travelY * drop.horizontalTravelRatio * progress;
        const y = startY + travelY * progress;
        const alpha = Math.max(
          0,
          Math.min(1, drop.baseOpacity * this.currentNightAlpha)
        );

        // Three short segments approximate the original transparent-to-opaque gradient.
        const first = drop.length * 0.34;
        const second = drop.length * 0.67;
        graphics.lineStyle(drop.thickness, PHASER_RAIN_CONFIG.color, alpha * 0.22);
        graphics.lineBetween(x, y, x, y + first);
        graphics.lineStyle(drop.thickness, PHASER_RAIN_CONFIG.color, alpha * 0.58);
        graphics.lineBetween(x, y + first, x, y + second);
        graphics.lineStyle(drop.thickness, PHASER_RAIN_CONFIG.color, alpha);
        graphics.lineBetween(x, y + second, x, y + drop.length);
      }
    }
  }

  function bootPhaserWeather() {
    if (!window.Phaser || document.getElementById("cozzyPhaserWeatherCanvas")) return;
    const parent = document.getElementById("phaserWeatherLayer");
    if (!parent) return;

    let weatherGame;
    try {
      weatherGame = new Phaser.Game({
        // The main field uses AUTO/WebGL. Rain deliberately uses Canvas so iOS
        // does not need a second WebGL context just for the screen-space overlay.
        type: Phaser.CANVAS,
        parent,
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
        transparent: true,
        backgroundColor: "rgba(0,0,0,0)",
        input: { activePointers: 0 },
        scene: CozzyWeatherScene,
        callbacks: {
          postBoot: (phaserGame) => {
            const canvas = phaserGame.canvas;
            if (canvas) {
              canvas.id = "cozzyPhaserWeatherCanvas";
              canvas.setAttribute("aria-hidden", "true");
              canvas.style.pointerEvents = "none";
            }
          }
        }
      });
    } catch (error) {
      console.warn("Phaser weather renderer could not start; using DOM rain fallback.", error);
      window.COZZY_PHASER_RAIN_ENABLED = false;
      return;
    }

    const resizeWeather = () => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      if (weatherGame?.scale?.resize) weatherGame.scale.resize(width, height);
    };
    window.addEventListener("resize", resizeWeather, { passive: true });
    window.visualViewport?.addEventListener("resize", resizeWeather, { passive: true });
    window.cozzyPhaserWeatherGame = weatherGame;
  }


  function collectPhaserLayoutDebug() {
    const scene = window.cozzyPhaserGame?.scene?.getScene?.("CozzyField");
    const rows = [];
    const ids = ["houseObject", "tree", "carObject", "shedObject"];
    for (const id of ids) {
      const element = document.getElementById(id);
      const mirror = scene?.staticSprites?.get?.(id)?.sprite;
      const dom = element ? getStaticWorldRect(element) : null;
      rows.push({
        id,
        domX: dom?.left ?? null,
        domY: dom?.top ?? null,
        domW: dom?.width ?? null,
        domH: dom?.height ?? null,
        phaserX: mirror?.x ?? null,
        phaserY: mirror?.y ?? null,
        phaserW: mirror?.displayWidth ?? null,
        phaserH: mirror?.displayHeight ?? null
      });
    }
    const firstEntity = document.querySelector(".zombie, .deer, .dog, .cat");
    if (firstEntity && scene?.entityMirrors?.has?.(firstEntity)) {
      const dom = getEntityWorldRect(firstEntity);
      const mirror = scene.entityMirrors.get(firstEntity)?.base;
      rows.push({
        id: firstEntity.classList.contains("zombie") ? "firstZombie" :
          firstEntity.classList.contains("deer") ? "firstDeer" :
          firstEntity.classList.contains("dog") ? "dog" : "cat",
        domX: dom?.centerX ?? null,
        domY: dom?.centerY ?? null,
        domW: dom?.width ?? null,
        domH: dom?.height ?? null,
        phaserX: mirror?.x ?? null,
        phaserY: mirror?.y ?? null,
        phaserW: mirror?.displayWidth ?? null,
        phaserH: mirror?.displayHeight ?? null
      });
    }
    console.table(rows);
    return rows;
  }

  window.cozzyPhaserDebugLayout = collectPhaserLayoutDebug;

  function bootPhaserField() {
    if (!window.Phaser || document.getElementById("cozzyPhaserCanvas")) return;
    const parent = document.getElementById("phaserFieldLayer");
    if (!parent) return;

    let game;
    try {
      game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: WORLD_SIZE,
      height: WORLD_SIZE,
      resolution: 1,
      scale: {
        mode: Phaser.Scale.NONE,
        width: WORLD_SIZE,
        height: WORLD_SIZE
      },
      transparent: true,
      backgroundColor: "rgba(0,0,0,0)",
      render: {
        antialias: true,
        pixelArt: false,
        roundPixels: false,
        powerPreference: "high-performance"
      },
      input: {
        activePointers: 0
      },
      scene: CozzyFieldScene,
      callbacks: {
        postBoot: (phaserGame) => {
          const canvas = phaserGame.canvas;
          if (canvas) {
            canvas.id = "cozzyPhaserCanvas";
            canvas.setAttribute("aria-hidden", "true");
            canvas.style.pointerEvents = "none";
          }
        }
      }
      });
    } catch (error) {
      console.warn("Phaser field renderer could not start; using DOM fallback.", error);
      document.body.classList.add("phaser-field-failed");
      return;
    }

    window.cozzyPhaserGame = game;
  }

  function bootCozzyPhaserRenderers() {
    bootPhaserField();
    bootPhaserWeather();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootCozzyPhaserRenderers, { once: true });
  } else {
    bootCozzyPhaserRenderers();
  }
})();
