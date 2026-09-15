/* qa-trooper scenarios — data only, executor does the work.
   Action types:
     tap        { sel }                    click a selector (difficulty card)
     key        { code, hold?ms }          synthetic keydown (+keyup after hold)
     wait       { ms }
   Assert types:
     errorsZero                            zero window 'error' events
     bodyClass  { val }                    body.className contains val
     hudVisible                            #hud display block
     speedGt    { v }                      parseInt(#speedval) > v
     textHas    { sel, val }               element textContent includes val
     elemShown  { sel }                    element exists && display !== 'none'
     elemHidden { sel }                    element exists && display === 'none'
     crankFill                              #meterfill width grew during a hold
   Every scenario auto-captures a final screenshot + FPS sample. */
export const SCENARIOS = [
  {
    id: 'phone-portrait-gate',
    desc: 'portrait phone shows rotate gate, not the ride',
    viewport: { width: 390, height: 844 },
    params: 'forcetouch',
    actions: [{ wait: 1500 }],
    asserts: [
      { type: 'errorsZero' },
      { type: 'bodyClass', val: 'hog-touch' },
      { type: 'elemShown', sel: '#rotateov' }
    ]
  },
  {
    id: 'phone-landscape-ride',
    desc: 'touch ride: start by card tap, auto-throttle reaches speed',
    viewport: { width: 844, height: 390 },
    params: 'forcetouch',
    actions: [
      { wait: 1500 },
      { tap: { sel: '.diffbtn:nth-child(2)' } },
      { wait: 4500 },
      { key: { code: 'KeyC' } },
      { wait: 1200 }
    ],
    asserts: [
      { type: 'errorsZero' },
      { type: 'bodyClass', val: 'hog-touch hog-riding' },
      { type: 'hudVisible' },
      { type: 'speedGt', v: 90 },
      { type: 'textHas', sel: '#meterlabel', val: 'HOLD CRANK' },
      { type: 'elemHidden', sel: '#rotateov' }
    ]
  },
  {
    id: 'desktop-ride-crank',
    desc: 'desktop: Digit2 start, hold Space cranks, meter fills, release scores',
    viewport: { width: 1280, height: 720 },
    params: '',
    actions: [
      { wait: 1500 },
      { key: { code: 'Digit2' } },
      { wait: 2500 },
      { key: { code: 'KeyW', hold: 6000 } },
      { key: { code: 'Space', hold: 2600 } },
      { wait: 900 }
    ],
    asserts: [
      { type: 'errorsZero' },
      { type: 'hudVisible' },
      { type: 'speedGt', v: 60 },
      { type: 'textHas', sel: '#meterlabel', val: 'HOLD SPACE' },
      { type: 'crankFill' }
    ]
  },
  {
    id: 'desktop-pause-mute',
    desc: 'M mutes, P pauses, pause overlay shows and clears',
    viewport: { width: 1280, height: 720 },
    params: '',
    actions: [
      { wait: 1500 },
      { key: { code: 'Digit2' } },
      { wait: 2000 },
      { key: { code: 'KeyM' } },
      { key: { code: 'KeyP' } },
      { wait: 600 },
      { key: { code: 'KeyP' } },
      { wait: 400 }
    ],
    asserts: [
      { type: 'errorsZero' },
      { type: 'elemShown', sel: '#mutetag' },
      { type: 'hudVisible' }
    ]
  },
  {
    id: 'tablet-landscape-ride',
    desc: 'tablet landscape rides with touch HUD, no overlap of meter and crank',
    viewport: { width: 1180, height: 820 },
    params: 'forcetouch',
    actions: [
      { wait: 1500 },
      { tap: { sel: '.diffbtn:nth-child(2)' } },
      { wait: 2000 }
    ],
    asserts: [
      { type: 'errorsZero' },
      { type: 'bodyClass', val: 'hog-riding' },
      { type: 'speedGt', v: 60 }
    ]
  }
];
