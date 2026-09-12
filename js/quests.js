/* ==========================================================================
   HOG CRANKERS — quests.js
   Procedural quest generator. The Pack are terrifying skeleton bikers who
   are actually incredibly supportive. NPC distress lines are ALL CAPS epic;
   the clarifier is always mundane and lowercase. The comedy is the contrast.
   Never wink. Never explain.

   Plain script (ES2019). No imports, no dependencies.
   Attaches ONE global: window.HogQuests
     - HogQuests.next()         -> quest object (first-ever call = canon quest)
     - HogQuests.randomFlavor() -> ALL-CAPS pack encouragement line for HUD toasts
     - HogQuests.reset()        -> fresh state (seed 1776, deterministic sequence)
     - HogQuests.counts()       -> pool sizes (debug/self-test)
   ========================================================================== */
(function () {
  "use strict";

  var SEED = 1776;

  /* ------------------------------------------------------------------ *
   * DISTRESS — the epic ALL-CAPS call. Mundane heartbreak, midwestern,
   * wholesome under it. The Pack hears a war horn. It is never a war.
   * ------------------------------------------------------------------ */
  var DISTRESS = [
    "MY WIFE LEFT ME.",
    "I GOT CUT FROM THE TEAM.",
    "MY HOG DIED AND I DON'T KNOW WHO I AM ANYMORE.",
    "MY KID THINKS I'M LAME.",
    "I JUST RETIRED AND NOTHING MATTERS.",
    "NOBODY CAME TO MY BIRTHDAY.",
    "MY TRUCK FAILED INSPECTION.",
    "THE GUYS AT WORK LAUGH AT MY LUNCH.",
    "I THINK MY DOG IS DISAPPOINTED IN ME.",
    "MY BEST FRIEND GOT A NEW BEST FRIEND.",
    "I WASN'T INVITED TO THE COOKOUT.",
    "MY SON ASKED ME TO STOP WAVING AT HIS FRIENDS.",
    "THE VENDING MACHINE ATE MY DOLLAR AND MY DIGNITY.",
    "I GOT THE OFFICE WITH NO WINDOWS.",
    "MY LAWN IS THE WORST ONE ON THE STREET.",
    "THE CHOIR DIRECTOR ASKED ME TO SING QUIETER.",
    "MY HIGH SCHOOL JACKET DOESN'T FIT ANYMORE.",
    "I WAVE AT EVERY TRUCK AND NOBODY WAVES BACK.",
    "MY COUSIN BEAT ME AT HORSESHOES AGAIN.",
    "I FOUND THE SURPRISE PARTY THEY WERE PLANNING FOR ME.",
    "THE BUFFET CANCELLED WEDNESDAYS.",
    "THEY SPELLED MY NAME WRONG ON MY OWN TROPHY.",
    "I HAVEN'T BEEN ANYONE'S EMERGENCY CONTACT IN YEARS.",
    "MY NEPHEW REMOVED ME FROM THE GROUP CHAT.",
    "THE BARBER ASKED IF I'M SURE.",
    "I THREW A BONFIRE AND NOBODY STAYED PAST NINE.",
    "THE LEAGUE MADE ME ASSISTANT CAPTAIN OUT OF PITY.",
    "I BUILT A DECK AND NOBODY HAS SEEN IT.",
    "MY RETIREMENT WATCH CAME FROM A GAS STATION.",
    "THE PONTOON WENT TO HER IN THE SETTLEMENT.",
    "I STILL PRACTICE MY HANDSHAKE IN THE MIRROR.",
    "THE BARBERSHOP TOOK MY PICTURE OFF THE WALL.",
    "I'VE BEEN ON HOLD WITH THE INSURANCE PEOPLE FOR TWO DAYS.",
    "SOMEBODY KNOCKED AND RAN. I STOOD THERE A WHILE.",
    "THE GARDEN GNOME IS FACING THE WRONG WAY AND IT FEELS SYMBOLIC.",
    "THE CHILI COOK-OFF GAVE ME A PARTICIPATION RIBBON.",
    "THE RACCOONS HAVE TAKEN THE GARAGE.",
    "THE SCHOOL BUS KIDS PULL THE SHADE DOWN WHEN I WAVE.",
    "MY POTLUCK DISH CAME HOME FULL.",
    "I TOLD A JOKE AT WORK AND NOBODY HEARD IT OVER THE PRINTER.",
    "THE GOLF COURSE SENT ME A LETTER ABOUT MY PACE.",
    "MY OLD TREEHOUSE LADDER FINALLY FELL OFF.",
    "THE VET SAYS MY CAT HAS OPINIONS NOW.",
    "THEY MOVED ME FROM REGISTER TWO TO REGISTER ONE.",
    "MY BROTHER-IN-LAW PARKS HIS NEW TRUCK WHERE I CAN SEE IT.",
    "THE STATE FAIR DISQUALIFIED MY PICKLES.",
    "I PRACTICED A SPEECH FOR THE HOA AND THEY SKIPPED TO OLD BUSINESS.",
    "MY RECLINER BROKE AND I SAT ON THE FLOOR LIKE A FOOL.",
    "THE DMV GUY CALLED ME SIR AND THEN LAUGHED.",
    "THE NEIGHBORS CALL MY MOWER THE LOUD ONE."
  ];

  /* ------------------------------------------------------------------ *
   * CLARIFY — the mundane lowercase truth. Must pair plausibly with ANY
   * distress, because pairing is random. Transit / errand / moral-support
   * flavored. Topic-flexible on purpose.
   * ------------------------------------------------------------------ */
  var CLARIFY = [
    "i just need a ride to my shift at the plant",
    "i just want to catch one fish with my dad",
    "i signed up for a 5k and i'm scared",
    "my lawnmower won't start and the grass is winning",
    "i need to return this punch bowl without making it weird",
    "i have jury duty at the courthouse at nine",
    "my kid has a soccer game clear across town and i promised",
    "i need a sheet cake before the store closes at eight",
    "i want to apologize about the fence thing and i keep driving past",
    "the boat trailer has to be at the lake by saturday",
    "i traded trucks with my cousin and i want mine back",
    "i've never been to a funeral for somebody i knew",
    "i need somebody to stand next to me at the bank",
    "my daughter's recital starts at six sharp",
    "i bought a recliner off a guy in a parking lot and it's still there",
    "i've been sitting in the driveway working up to the post office",
    "the guys meet at the diner and nobody's called me yet",
    "i want to vote early before the line gets long",
    "my mom's bus comes in at four and i want it to go right",
    "i have a coupon that expires tonight and it's for a real amount",
    "i want to see the giant pumpkins before they judge them",
    "my watch is at the repair shop and they close at five",
    "my buddy's truck won't start and he's got a game",
    "i signed up for buns and i can't show up empty-handed",
    "there's a christening and i don't know what you bring to one",
    "i have to apologize to a guy from church and he's big",
    "the cat's shot appointment is at four and he knows",
    "i want to stand in line for the good fireworks",
    "i've been circling this parking lot for twenty minutes",
    "i want to drive past my old house exactly one time",
    "my buddy needs a second set of hands for a pool table",
    "i need a witness when i return this toaster",
    "i have to pick a paint color for my truck and i don't trust myself alone",
    "i'm speaking at the zoning board about the stop sign",
    "i told the whole shop i'd bring ribs",
    "i have to look my old coach in the eye at the banquet",
    "my kid's volcano is due tomorrow and it's not erupting",
    "the rummage sale opens at seven and the good tools go first",
    "i'm renewing my license and i always blow the eye part",
    "family photo is tonight and i have to smile normal",
    "i'm judging the pie contest and now i know everybody's secrets",
    "my shift at the plant started twenty minutes ago",
    "i decided to be nicer to people and the hardware store is a start",
    "there's a car show and i told the guys mine is louder than it is",
    "i have to deliver a casserole while it's still hot",
    "i want to get her flowers before she changes her mind about me"
  ];

  /* ------------------------------------------------- *
   * NAMES — regular midwestern first names (ALL CAPS).
   * ------------------------------------------------- */
  var NAMES = [
    "GARY", "DALE", "KYLE", "BRENDA", "DOUG", "TAMMY",
    "RON", "LINDA", "CHUCK", "DARLENE", "KEITH", "PEGGY",
    "BRIAN", "DENISE", "RICK", "SANDY", "TERRY", "JUDY",
    "WAYNE", "CINDY", "GLEN", "DEB", "RUSS", "PAM",
    "EARL", "CAROL", "STU", "MICHELLE", "WADE", "TRISH",
    "KEVIN", "RHONDA", "LARRY", "BEV", "STAN", "REBECCA"
  ];

  /* --------------------------------------------------------------- *
   * OBJECTS — quest title grammar: "THE <OBJECT> OF <BrotherName>".
   * --------------------------------------------------------------- */
  var OBJECTS = [
    "COUCH", "LAWNMOWER", "FISHING POLE", "PUNCH BOWL", "CROCKPOT", "RECLINER",
    "CANOE", "TROPHY", "CAST IRON SKILLET", "SNOWBLOWER", "TOOLBOX", "BIRD FEEDER",
    "BACKYARD GRILL", "SLED", "WHEELBARROW", "COOLER", "ROTOTILLER", "KAYAK",
    "MAILBOX", "GAZEBO", "TRAMPOLINE", "PICKUP TRUCK", "GARAGE DOOR", "HEDGE TRIMMER",
    "TOMATOES", "SMOKER", "LADDER", "DARTBOARD", "BINGO CAGE", "LAWN CHAIR",
    "DEER STAND", "ICE SHANTY", "LUCKY HAT", "ZUCCHINI", "JELLO SALAD", "CASSEROLE"
  ];

  /* ---------------------------------------------- *
   * Title grammar B: "OPERATION <ADJ> <NOUN>".
   * Epic adjectives, then the mundane crashes in.
   * ---------------------------------------------- */
  var OP_ADJ = [
    "STEEL", "THUNDER", "IRON", "CRIMSON", "MIDNIGHT", "CHROME",
    "GRIM", "WILD", "BURNING", "FROZEN", "GOLDEN", "SILENT",
    "RELENTLESS", "REDLINE", "HOLLOW", "SACRED", "ELECTRIC", "WINTER",
    "LEAD", "SECOND"
  ];

  var OP_NOUN = [
    "VOW", "COUCH", "HAMMER", "RECKONING", "HIGHWAY", "FURNACE",
    "THROTTLE", "TRAIL", "BRISKET", "CASSEROLE", "HEDGE", "PICKLES",
    "COOLER", "MAILBOX", "LAWN CHAIR", "LADDER", "PROMISE", "BANNER",
    "SUNDAY", "GAVEL"
  ];

  /* ------------------------------------------------------- *
   * DESTINATIONS — name + short flavor kind.
   * ------------------------------------------------------- */
  var DESTINATIONS = [
    { name: "SUDS FAMILY DINER", kind: "diner" },
    { name: "BIG MIKE'S AUTO", kind: "garage" },
    { name: "COUNTY FAIRGROUNDS", kind: "fair" },
    { name: "THE BAIT SHOP", kind: "shop" },
    { name: "WALMART PARKING LOT", kind: "lot" },
    { name: "HANSON'S HARDWARE", kind: "hardware" },
    { name: "NORTHGATE STEEL PLANT", kind: "plant" },
    { name: "SECOND BAPTIST CHURCH", kind: "church" },
    { name: "THE LEGION HALL", kind: "hall" },
    { name: "ELKS LODGE 412", kind: "lodge" },
    { name: "RIVERBEND BOAT RAMP", kind: "ramp" },
    { name: "COUNTY TRANSFER STATION", kind: "dump" },
    { name: "MIDWAY LANES", kind: "bowling" },
    { name: "THE DMV ON FIFTH", kind: "dmv" },
    { name: "TRAPPER'S SPORTING GOODS", kind: "shop" },
    { name: "THE SHELL ON ROUTE 9", kind: "gas" },
    { name: "THE FROSTY FREEZE", kind: "ice cream" },
    { name: "VETERANS MEMORIAL PARK", kind: "park" },
    { name: "THE OLD GRAVEL PIT", kind: "pit" },
    { name: "STARLITE DRIVE-IN", kind: "drive-in" }
  ];

  /* --------------------------------------------------------------- *
   * FLAVOR — ALL-CAPS pack encouragement for HUD toasts. Supportive.
   * Always supportive. That is the whole point of the Pack.
   * --------------------------------------------------------------- */
  var FLAVOR = [
    "HELL YEAH BROTHER",
    "AROOOO",
    "THAT HOG SOUNDS LIKE ABSOLUTE SHIT. LET'S FIX THAT.",
    "NOBODY CRANKS ALONE.",
    "GET BACK ON THAT MFER.",
    "THE PACK RIDES WITH YOU TONIGHT, BROTHER.",
    "CRANK IT UNTIL THE NEIGHBORS BELIEVE IN YOU.",
    "WE DON'T KNOCK. WE PULL UP AND WE BELIEVE.",
    "EVERY LEGEND STARTS AS A GUY IN HIS DRIVEWAY.",
    "FULL THROTTLE INTO BECOMING BETTER, BROTHER.",
    "THE ROAD DOESN'T CARE. WE CARE ENOUGH FOR BOTH.",
    "WE ARE ALL ONE HOG UNDER THE LEATHER.",
    "CRYING AT A RED LIGHT IS STILL RIDING.",
    "THE BONES REMEMBER WHO SHOWED UP.",
    "LOUD PIPES. LOYAL BROTHERS.",
    "WE'LL WAIT OUTSIDE. AS LONG AS IT TAKES.",
    "STAY SAFE. STAY LOVED. STAY CRANKED.",
    "THE ERRAND IS THE FRONT LINE, BROTHER.",
    "AROO, LITTLE BROTHER. AROO.",
    "DO IT FOR THE HOG. DO IT FOR YOU."
  ];

  /* ------------------------------------------------------------------ *
   * Seeded PRNG (mulberry32). Two streams: the quest stream (seed 1776)
   * drives next() and is never touched by toasts, so reset() always
   * reproduces the exact same quest sequence. The flavor stream is
   * seeded separately so HUD toast timing can't shift quest generation.
   * ------------------------------------------------------------------ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rng = null;         // quest stream
  var flavorRng = null;   // toast stream
  var nextId = 1;
  var lastDistressIdx = -1;

  function pick(r, arr) {
    return arr[Math.floor(r() * arr.length)];
  }

  function rollReward(r) {
    // 80..200, rounded to the nearest 10
    return 80 + 10 * Math.floor(r() * 13);
  }

  // The Pack shouts. Every quest title is ALL CAPS, brother.
  function titleCase(name) {
    return name.toUpperCase();
  }

  // Grammar mix ~70/30: "THE <OBJECT> OF <BrotherName>" / "OPERATION <ADJ> <NOUN>"
  function buildTitle(r, brother) {
    if (r() < 0.7) {
      return "THE " + pick(r, OBJECTS) + " OF " + titleCase(brother);
    }
    return "OPERATION " + pick(r, OP_ADJ) + " " + pick(r, OP_NOUN);
  }

  function makeCanonQuest() {
    return {
      id: 1,
      brother: "GARY",
      distress: "MY WIFE LEFT ME.",
      clarify: "i just need to pick up my couch from her apartment",
      title: "THE COUCH OF REBECCA",
      objective: "TOW GARY TO SUDS FAMILY DINER",
      destination: { name: "SUDS FAMILY DINER", kind: "diner" },
      reward: 100
    };
  }

  function next() {
    var id, brother, di, distress, clarify, title, dest;

    // The one true locked quest. Every rider's story starts here.
    if (nextId === 1) {
      nextId = 2;
      lastDistressIdx = 0;
      return makeCanonQuest();
    }

    id = nextId;
    nextId += 1;

    brother = pick(rng, NAMES);

    di = Math.floor(rng() * DISTRESS.length);
    if (di === lastDistressIdx) {
      di = (di + 1) % DISTRESS.length; // no back-to-back repeats, still deterministic
    }
    lastDistressIdx = di;
    distress = DISTRESS[di];

    clarify = pick(rng, CLARIFY);
    title = buildTitle(rng, brother);
    dest = DESTINATIONS[Math.floor(rng() * DESTINATIONS.length)];

    return {
      id: id,
      brother: brother,
      distress: distress,
      clarify: clarify,
      title: title,
      objective: "TOW " + brother + " TO " + dest.name,
      destination: { name: dest.name, kind: dest.kind },
      reward: rollReward(rng)
    };
  }

  function reset() {
    rng = mulberry32(SEED);
    flavorRng = mulberry32((SEED ^ 0x9E3779B9) >>> 0);
    nextId = 1;
    lastDistressIdx = -1;
  }

  function randomFlavor() {
    return pick(flavorRng, FLAVOR);
  }

  function counts() {
    return {
      distress: DISTRESS.length,
      clarify: CLARIFY.length,
      names: NAMES.length,
      objects: OBJECTS.length,
      destinations: DESTINATIONS.length,
      flavor: FLAVOR.length
    };
  }

  reset();

  var root = (typeof window !== "undefined") ? window : globalThis;
  root.HogQuests = {
    next: next,
    reset: reset,
    randomFlavor: randomFlavor,
    counts: counts
  };
})();
