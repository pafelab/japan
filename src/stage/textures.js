/* Textures from rasterized canvases: exact colours (no colour-space conversion: the art's sRGB bytes are
   sampled and written back untouched), premultiplied, no mipmaps (drawn 1:1 with the DOM box). */
import { Texture, LinearFilter, ClampToEdgeWrapping, NoColorSpace } from 'three';

export function canvasTexture(canvas, renderer) {
  const t = new Texture(canvas);
  t.flipY = false;
  t.premultiplyAlpha = true;
  t.generateMipmaps = false;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  if (renderer) {
    renderer.initTexture(t);                               // upload now, not on the first drawn frame
    t.userData.size = [canvas.width, canvas.height];
    canvas.width = canvas.height = 1;                      // the GPU copy is all we keep
  }
  return t;
}
