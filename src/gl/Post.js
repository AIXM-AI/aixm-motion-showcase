import {
  BufferAttribute, BufferGeometry, HalfFloatType, LinearFilter, LinearMipmapLinearFilter,
  Mesh, OrthographicCamera, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, WebGLRenderTarget,
} from 'three';
import vert from './shaders/post.vert.glsl?raw';
import frag from './shaders/post.frag.glsl?raw';

// Particles render into a mipmapped target; one fullscreen-triangle pass composites everything.
export class Post {
  constructor(renderer, ink) { // ink: 0xRRGGBB, composited in display space
    const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.target = new WebGLRenderTarget(1, 1, {
      type: hdr ? HalfFloatType : UnsignedByteType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.material = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        uRes: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uWipe: { value: -1 },
        uBloom: { value: hdr ? 0.85 : 1.1 },
        uInk: { value: new Vector3(((ink >> 16) & 255) / 255, ((ink >> 8) & 255) / 255, (ink & 255) / 255) },
      },
    });
    const quad = new Mesh(geo, this.material);
    quad.frustumCulled = false;
    this.scene = new Scene();
    this.scene.add(quad);
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h) {
    this.target.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
  }

  render(renderer, scene, camera) {
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
