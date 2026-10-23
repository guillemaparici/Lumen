/* Lumen — motor de render (WebGL2)
   Un sol "fragment shader" fa geometria (rotació 90°, voltejat, endreçar, retall) i ajustos de color.
   Convencions: coordenades d'imatge amb Y cap avall. "Frame" = imatge ja girada/voltejada (W×H),
   i el retall (crop) s'expressa en píxels del frame. */
(function () {
  const VERT = `#version 300 es
  in vec2 a_pos; out vec2 v_uv;
  void main(){ v_uv = vec2(a_pos.x*0.5+0.5, 0.5 - a_pos.y*0.5); gl_Position = vec4(a_pos,0.,1.); }`;

  const FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D u_tex;
  uniform vec2 u_frame;
  uniform vec4 u_crop;   // regió visible (subrectangle) en píxels de frame
  uniform vec4 u_full;   // retall complet (defineix l'àrea vàlida, la vinyeta i la mida del detall)
  uniform float u_angle;
  uniform int u_rot;
  uniform vec2 u_flip;
  uniform vec4 u_a0; // brillantor, contrast, saturació, ambient
  uniform vec4 u_a1; // llums, ombres, temperatura, tinta
  uniform vec2 u_a2; // nitidesa, vinyeta
  in vec2 v_uv; out vec4 o;

  vec2 toSrc(vec2 f, out float inside){
    vec2 c = u_frame*0.5; vec2 d = f - c;
    float ca = cos(u_angle), sa = sin(u_angle);
    vec2 s = c + vec2(ca*d.x + sa*d.y, -sa*d.x + ca*d.y);
    inside = step(0.0,s.x)*step(s.x,u_frame.x)*step(0.0,s.y)*step(s.y,u_frame.y);
    vec2 b = s/u_frame;
    if(u_flip.x > 0.5) b.x = 1.0 - b.x;
    if(u_flip.y > 0.5) b.y = 1.0 - b.y;
    vec2 r;
    if(u_rot == 0) r = b;
    else if(u_rot == 1) r = vec2(b.y, 1.0 - b.x);
    else if(u_rot == 2) r = vec2(1.0 - b.x, 1.0 - b.y);
    else r = vec2(1.0 - b.y, b.x);
    return r;
  }
  vec3 fetchF(vec2 f){ float ins; return texture(u_tex, toSrc(f, ins)).rgb; }
  float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

  void main(){
    vec2 p = v_uv;
    vec2 f0 = u_crop.xy + p*u_crop.zw;
    float ins; vec2 r = toSrc(f0, ins);
    ins *= step(u_full.x, f0.x)*step(f0.x, u_full.x+u_full.z)*step(u_full.y, f0.y)*step(f0.y, u_full.y+u_full.w);
    vec3 c0 = texture(u_tex, r).rgb;
    vec3 c = c0;

    float bri=u_a0.x, con=u_a0.y, sat=u_a0.z, amb=u_a0.w;
    float hi=u_a1.x, sh=u_a1.y, warm=u_a1.z, tint=u_a1.w;
    float sharp=u_a2.x, vig=u_a2.y;

    // Detall local (mida relativa al costat llarg del retall => mateix aspecte en vista i exportació)
    float longSide = max(u_full.z, u_full.w);
    vec3 detail = vec3(0.0), local = vec3(0.0);
    if(sharp > 0.0){
      float d = longSide * 0.0016;
      vec3 bl = (fetchF(f0+vec2(d,0.))+fetchF(f0-vec2(d,0.))+fetchF(f0+vec2(0.,d))+fetchF(f0-vec2(0.,d)))*0.25;
      detail = c0 - bl;
    }
    if(amb != 0.0){
      float d = longSide * 0.012;
      vec3 bl = (fetchF(f0+vec2(d,0.))+fetchF(f0-vec2(d,0.))+fetchF(f0+vec2(0.,d))+fetchF(f0-vec2(0.,d)))*0.25;
      local = c0 - bl;
    }

    // Exposició (en espai lineal)
    if(bri != 0.0){
      vec3 lin = pow(max(c,0.0), vec3(2.2));
      lin *= exp2(bri*1.6);
      c = pow(lin, vec3(1.0/2.2));
    }
    // Ombres i llums
    float L = luma(c);
    float wS = pow(1.0 - clamp(L,0.,1.), 2.0);
    float wH = L*L;
    c *= 1.0 + sh*0.9*wS + hi*0.45*wH;
    // Contrast
    c = (c - 0.5)*(1.0 + con*0.7) + 0.5;
    // Ambient: contrast local + una mica de color
    if(amb != 0.0){ c += local*amb*1.1; sat += amb*0.25; }
    // Saturació
    float L2 = luma(c);
    c = mix(vec3(L2), c, 1.0 + sat);
    // Temperatura i tinta
    c.r *= 1.0 + warm*0.22; c.b *= 1.0 - warm*0.22; c.g *= 1.0 + warm*0.02;
    c.g *= 1.0 - tint*0.16; c.r *= 1.0 + tint*0.06; c.b *= 1.0 + tint*0.06;
    // Nitidesa
    c += detail*sharp*1.2;
    // Vinyeta
    if(vig != 0.0){
      vec2 pf = (f0 - u_full.xy) / u_full.zw;
      vec2 q = (pf - 0.5) * vec2(u_full.z/u_full.w, 1.0);
      float m = smoothstep(0.30, 0.95, length(q)*1.35);
      if(vig > 0.0) c = mix(c, vec3(1.0), vig*0.55*m); else c *= 1.0 + vig*0.95*m;
    }
    c = clamp(c, 0.0, 1.0);
    o = vec4(c*ins, ins);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const ADJ_KEYS = ['brightness', 'contrast', 'saturation', 'ambience', 'highlights', 'shadows', 'warmth', 'tint', 'sharpen', 'vignette'];

  class Engine {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = 2;
      const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true });
      if (!gl) throw new Error('NO_WEBGL2');
      this.gl = gl;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog;
      gl.useProgram(prog);
      this.u = {};
      ['u_tex', 'u_frame', 'u_crop', 'u_full', 'u_angle', 'u_rot', 'u_flip', 'u_a0', 'u_a1', 'u_a2'].forEach((n) => (this.u[n] = gl.getUniformLocation(prog, n)));
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a_pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.tex = gl.createTexture();
      this.srcW = this.srcH = 0;
      this.maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192);
      const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      this.maxOut = Math.min(vp[0], vp[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 8192);
    }

    /** Puja la imatge font. Retorna {w,h,downscaled}. */
    setSource(img) {
      const gl = this.gl;
      let w = img.width, h = img.height, src = img, downscaled = false;
      const k = Math.min(1, this.maxTex / Math.max(w, h));
      if (k < 1) {
        const c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        src = c; w = c.width; h = c.height; downscaled = true;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.srcW = w; this.srcH = h;
      return { w, h, downscaled };
    }

    static frameSize(w, h, rot) { return rot % 2 ? { w: h, h: w } : { w, h }; }

    /** Renderitza al canvas intern de mida outW×outH. geo = {rot,flipH,flipV,angle(°),crop:{x,y,w,h}} (crop = regió a dibuixar),
       adj = {clau: valor}, full = retall complet (per defecte, el mateix crop). */
    render(outW, outH, geo, adj, full) {
      const gl = this.gl;
      if (this.canvas.width !== outW || this.canvas.height !== outH) { this.canvas.width = outW; this.canvas.height = outH; }
      gl.viewport(0, 0, outW, outH);
      gl.useProgram(this.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(this.u.u_tex, 0);
      const f = Engine.frameSize(this.srcW, this.srcH, geo.rot);
      gl.uniform2f(this.u.u_frame, f.w, f.h);
      gl.uniform4f(this.u.u_crop, geo.crop.x, geo.crop.y, geo.crop.w, geo.crop.h);
      const fu = full || geo.crop;
      gl.uniform4f(this.u.u_full, fu.x, fu.y, fu.w, fu.h);
      gl.uniform1f(this.u.u_angle, (geo.angle || 0) * Math.PI / 180);
      gl.uniform1i(this.u.u_rot, geo.rot | 0);
      gl.uniform2f(this.u.u_flip, geo.flipH ? 1 : 0, geo.flipV ? 1 : 0);
      const a = (k) => (adj && adj[k]) || 0;
      gl.uniform4f(this.u.u_a0, a('brightness'), a('contrast'), a('saturation'), a('ambience'));
      gl.uniform4f(this.u.u_a1, a('highlights'), a('shadows'), a('warmth'), a('tint'));
      gl.uniform2f(this.u.u_a2, Math.max(0, a('sharpen')), a('vignette'));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    toBlob(type, quality) {
      return new Promise((res) => this.canvas.toBlob(res, type, quality));
    }
  }

  window.LumenEngine = Engine;
  window.ADJ_KEYS = ADJ_KEYS;
})();
