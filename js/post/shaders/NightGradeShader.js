( function () {

	/* WAVE 43 NIGHT CINEMA GRADE — final full-screen grade, LAST in the composer chain
	   (after FXAA so the grain is never blurred by the AA pass). Three moves, all subtle:
	   1. Split-tone: warm-ember shadow lift + slightly-cool highlight tint, additive with
	      pow(luma, 2.5) weights so mid luminance is untouched (luma ~0.5 adds < 1/255).
	   2. Film grain: monochrome hash noise (same value on r,g,b — never color confetti),
	      time-sliced at 24fps so it crawls instead of smearing. Amplitude uGrain ~0.02.
	   3. Radial chromatic aberration: R/B sampled with tiny opposing offsets scaled by
	      uCA * dist(vUv, center)^2 — zero at center, ~1-2px of R/B separation at corners.
	   NO vignette here — the DOM #vignette in index.html owns the frame edge.
	   Desktop composer tier only; the auto-degrade postOn kill already removes it. */

	const NightGradeShader = {
		uniforms: {
			'tDiffuse': {
				value: null
			},
			'uTime': {
				value: 0.0
			},
			'uGrain': {
				value: 0.02
			},
			'uShadowTint': {
				value: new THREE.Vector3( 0.045, 0.02, 0.012 )   /* ember lift: R-dominant, blue-killed */
			},
			'uHighTint': {
				value: new THREE.Vector3( 0.0, 0.012, 0.028 )    /* cool highlight: cyan lean, no red */
			},
			'uCA': {
				value: 0.0020
			}
		},
		vertexShader:
	  /* glsl */
	  `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
		fragmentShader:
	  /* glsl */
	  `

		precision highp float;

		uniform sampler2D tDiffuse;
		uniform float uTime;
		uniform float uGrain;
		uniform vec3 uShadowTint;
		uniform vec3 uHighTint;
		uniform float uCA;

		varying vec2 vUv;

		/* Hoskins hash12 — the classic fract(sin(dot)*43758) hash degenerates on float32
		   GPU sin at arguments this large (gl_FragCoord * 43758 ~ 5e9 on ANGLE/Metal),
		   which audited as weak, structured grain. This one stays small-argument. */
		float hash( vec2 p ) {

			vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
			p3 += dot( p3, p3.yzx + 33.33 );
			return fract( ( p3.x + p3.y ) * p3.z );

		}

		void main() {

			/* radial CA: offset grows with dist^2 so the frame center is untouched */
			vec2 fromC = vUv - vec2( 0.5 );
			float d = distance( vUv, vec2( 0.5 ) );
			vec2 caOff = fromC * ( uCA * d );
			vec3 col;
			col.r = texture2D( tDiffuse, vUv - caOff ).r;
			col.g = texture2D( tDiffuse, vUv ).g;
			col.b = texture2D( tDiffuse, vUv + caOff ).b;

			/* split-tone: shadow ember / highlight cool, weighted to spare the mids */
			float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
			col += uShadowTint * pow( 1.0 - clamp( luma, 0.0, 1.0 ), 2.5 );
			col += uHighTint * pow( clamp( luma, 0.0, 1.0 ), 2.5 );

			/* monochrome grain, 24fps time slices (wrapped so hash args stay precise) */
			float t = mod( floor( uTime * 24.0 ), 64.0 );
			float g = hash( gl_FragCoord.xy + vec2( t * 191.0, t * 277.0 ) ) - 0.5;
			col += g * uGrain;

			gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );

		}`
	};

	THREE.NightGradeShader = NightGradeShader;

} )();
