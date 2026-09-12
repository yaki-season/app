import * as THREE from 'three';

// 사용자 지정 조립 완료 원본을 그대로 UV 기준으로 사용한다. 픽셀의 좌표/alpha는
// 변경하지 않고 정적인 굽기 표면을 한 번만 렌더한다. 영업 중에는 MeshBasicMaterial의
// 상태 텍스처만 교체하며 프레임마다 조리색 셰이더를 실행하지 않는다.
export const NEGIMA_COOK_STAGES = Object.freeze(['raw', 'cooking', 'proper', 'overcooked', 'burnt']);

export function createNegimaStageTextures(renderer, source) {
  const width = source.image.width;
  const height = source.image.height;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const material = new THREE.ShaderMaterial({
    uniforms: { source: { value: source }, stage: { value: 0 }, size: { value: new THREE.Vector2(width, height) } },
    vertexShader: 'varying vec2 uvSource; void main(){ uvSource=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `
      uniform sampler2D source; uniform float stage; uniform vec2 size;
      varying vec2 uvSource;
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){
        vec4 original=texture2D(source,uvSource);
        vec2 pixel=floor(uvSource*size);
        vec3 c=original.rgb;
        // ImageBitmap 원점은 이미지 위쪽. 식재료는 원본 y=100..400에만 있다.
        // 노출된 대나무의 끝과 손잡이는 착색하지 않는다.
        float food=step(0.202,uvSource.y)*step(uvSource.y,0.810);
        float green=step(c.r*0.90,c.g);
        float luminance=dot(c,vec3(.299,.587,.114));
        float patchNoise=hash(floor(pixel/vec2(5.,7.)));
        float grain=hash(pixel);
        float band=pow(abs(sin(pixel.y*.14+pixel.x*.038)),10.);
        float sear=clamp(band*.65+step(.72,patchNoise)*.45,0.,1.);
        float amount=stage==1.?.28:1.;
        // 원본 갈색에서 단순히 더 붉어지지 않도록 같은 명암/주름을 불투명한 황금빛 살결로 옮긴다.
        vec3 chickenGolden=c*vec3(1.06,1.70,.90)+vec3(.018,.024,.003);
        vec3 leekGolden=c*vec3(1.12,.89,.55)+vec3(.015,.01,.003);
        vec3 golden=mix(chickenGolden,leekGolden,green);
        vec3 cooked=mix(c,golden,amount);
        float charAmount=stage==1.?0.:stage==2.?sear*.32:stage==3.?sear*.75+.14: .73+grain*.17;
        vec3 charColor=vec3(.019,.012,.008)+luminance*.065;
        cooked=mix(cooked,charColor,charAmount);
        gl_FragColor=vec4(mix(c,cooked,food),original.a);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geometry, material));
  const targets = NEGIMA_COOK_STAGES.slice(1).map(stage => {
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false, colorSpace: THREE.SRGBColorSpace,
    });
    target.texture.name = `negima-tray-derived:${stage}`;
    return target;
  });
  const textures = Object.freeze(Object.fromEntries(NEGIMA_COOK_STAGES.map((stage, i) => [stage, i === 0 ? source : targets[i - 1].texture])));
  function renderStages() {
    const previous = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    try {
      renderer.setClearColor(0x000000, 0);
      targets.forEach((target, index) => {
        material.uniforms.stage.value = index + 1;
        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(scene, camera);
      });
    } finally {
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clearColor, clearAlpha);
    }
  }
  function dispose() {
    renderer.domElement.removeEventListener('webglcontextrestored', renderStages);
    targets.forEach(target => target.dispose());
    geometry.dispose(); material.dispose();
  }
  try { renderStages(); } catch (error) { dispose(); throw error; }
  // GPU 문맥을 잃었다 돌아와도 같은 texture 객체에 다시 그려 빈 꼬치가 되지 않는다.
  renderer.domElement.addEventListener('webglcontextrestored', renderStages);
  return { textures, targets, dispose };
}
