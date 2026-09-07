export const PASTE_MAX_SIDE = 400;
export const IMAGE_MIN_SIDE = 20;
export const HANDLE_HIT = 12;

export function fitPasteSize(naturalW, naturalH, maxSide = PASTE_MAX_SIDE) {
  const w = Number(naturalW) || 1;
  const h = Number(naturalH) || 1;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return {
    w: Math.max(1, w * scale),
    h: Math.max(1, h * scale),
  };
}

export function cloneImage(image) {
  return {
    id: image.id,
    src: image.src,
    x: image.x,
    y: image.y,
    w: image.w,
    h: image.h,
  };
}

/** @returns {'nw'|'ne'|'sw'|'se'|null} */
export function hitTestHandle(image, wx, wy, handleHit = HANDLE_HIT) {
  if (!image) return null;
  const corners = {
    nw: [image.x, image.y],
    ne: [image.x + image.w, image.y],
    sw: [image.x, image.y + image.h],
    se: [image.x + image.w, image.y + image.h],
  };
  for (const [name, [cx, cy]] of Object.entries(corners)) {
    if (Math.abs(wx - cx) <= handleHit && Math.abs(wy - cy) <= handleHit) {
      return name;
    }
  }
  return null;
}

export function hitTestImage(images, wx, wy) {
  const list = [...images].reverse();
  for (const img of list) {
    if (
      wx >= img.x &&
      wx <= img.x + img.w &&
      wy >= img.y &&
      wy <= img.y + img.h
    ) {
      return img;
    }
  }
  return null;
}

export function resizeFromHandle(image, handle, wx, wy, minSide = IMAGE_MIN_SIDE) {
  const right = image.x + image.w;
  const bottom = image.y + image.h;
  let x = image.x;
  let y = image.y;
  let w = image.w;
  let h = image.h;

  if (handle === 'se') {
    w = Math.max(minSide, wx - image.x);
    h = Math.max(minSide, wy - image.y);
  } else if (handle === 'sw') {
    const nextX = Math.min(wx, right - minSide);
    w = right - nextX;
    h = Math.max(minSide, wy - image.y);
    x = nextX;
  } else if (handle === 'ne') {
    const nextY = Math.min(wy, bottom - minSide);
    w = Math.max(minSide, wx - image.x);
    h = bottom - nextY;
    y = nextY;
  } else if (handle === 'nw') {
    const nextX = Math.min(wx, right - minSide);
    const nextY = Math.min(wy, bottom - minSide);
    w = right - nextX;
    h = bottom - nextY;
    x = nextX;
    y = nextY;
  }

  return { x, y, w, h };
}
