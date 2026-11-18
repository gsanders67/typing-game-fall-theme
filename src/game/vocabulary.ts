import type { Difficulty } from './engine';

// Gen Z meme slang mixed into every difficulty. Only letters and spaces can be typed, so "6 7" is spelled out.
export const MEME_WORDS: Record<Difficulty, readonly string[]> = {
  Acorn: `rizz sigma slay sus yeet bet cap ohio aura bruh simp npc mid ick drip lit fr ong based tuff unc mog vibe yap glaze era sheesh ratio stan salty chud chad oof yikes cope bozo nerd goat`.split(' '),
  Harvest: `skibidi bussin delulu cooked goated lowkey highkey periodt bestie boujee rizzler mewing yapping glazing chopped crashout demure brainrot gigachad griddy gatekeep pookie slaps mogging nocap sixseven ghosted cringe iykyk lookmaxing smoothbrain bigbrain copium hopium skillissue gigabrain sayless`.split(' '),
  Bonfire: `skibiditoilet sigmagrindset maincharacter touchgrass fanumtax vibecheck rentfree looksmaxxing aurafarming letemcook itsgiving ohiorizz brainrotted mewingstreak rizzlerking delulusolulu npcenergy sigmamale goatedwiththesauce sixsevensixseven chadmoment bruhmoment smoothbrained beforegtasix galaxybrain copiumoverdose emotionaldamage wearesoback itissoover`.split(' '),
  'Final feast': [
    'six seven', 'no cap fr fr', 'let him cook', 'touch some grass', 'its giving main character',
    'skibidi toilet rizz', 'that is so sigma', 'minus a thousand aura', 'bro is so cooked', 'lowkey bussin',
    'understood the assignment', 'living rent free', 'chat is this real', 'passed the vibe check', 'fanum tax the snacks',
    'six seven six seven', 'only in ohio', 'mewing streak unlocked', 'delulu is the solulu', 'pookie bear energy',
    'big yikes bestie', 'stop the yapping', 'ate and left no crumbs', 'that is lowkey sus', 'goated with the sauce',
    'certified rizzler', 'crashout incoming', 'aura farming season', 'npc behavior detected', 'it is giving fall vibes',
        'chad moment', 'bruh moment', 'bruh moment twenty seventy seven', 'before gta six', 'smooth brain energy',
        'certified chud behavior', 'skill issue detected', 'emotional damage', 'galaxy brain move', 'big brain time',
        'massive cope', 'ratio plus l plus bozo', 'we are so back', 'it is so over', 'average lookmaxing enjoyer',
        'one more round before gta six', 'caught in four k', 'say less', 'main character moment', 'touch grass immediately',
  ],
};

const BASE_VOCABULARY: Record<Difficulty, readonly string[]> = {
  Acorn: `acorn amber apple ash bark bean birch boot breeze brown camp cape cedar chill cider clay cloud cocoa corn crow dawn deer dusk elm ember fall fern field fire fog forest fox frost gold gourd grass green grove gust halo hay hazel hill ivy lake leaf log maple mist moss nest nut oak owl path pear pine pond rain rake red reed root rose rust sage seed sky snug soil soup star storm straw sun tea tent trail tree twig vine warm wheat wind wolf wood wool xbox forza gears game play team jump dash loot save load race goal win gem quest hero mana heal tank raid gear aim bow dice code disc drop flag fort gift glow guild helm hit host hunt join key kick king kite land lane light link lobby luck map menu mode moon move music next night pad party pass pause ping pixel pool power rank rest ring rock roll round run sail scout sea ship shop show skill skin snow solo song spawn speed spell spin spot squad stack stage start state steam stick store sword tag tap task time tool torch town trade turn type unit vault view voice vote wait walk wave west wild wing wish yard zone`.split(' '),
  Harvest: `autumn bonfire console controller maple pumpkin harvest sweater victory arcade avatar backpack battery blanket blossom bookmark border branch browser bundle button cabin camera candle capture carrot castle champion channel chest chicken circuit classic closet cloudy coconut coffee comfort compass connect cookie copper costume country crafting crimson crossplay crystal custom dashboard daylight digital dinner dragon drawing dreamy driving dungeon eagle earth ending energy evening explore family farming festival fireside fishing flower follow football forestland fragrant freedom friends friendly gamepass garden gateway ginger golden grapple headset helmet hillside holiday horizon invite island jacket jumper kettle lantern launch layers leaves library loading lookout meadow message minecraft mission morning mountain mushroom network october online orange orchard outfit pancake partner patch people picnic pillow player playlist pocket popcorn portal practice present profile puzzle rabbit racing rainbow ranked ranking recipe records remote replay rescue return ribbon rocket rooftop router rumble runner sandbox scarf screen season server session shadow shelter signal silver skillet sleepy smile smooth socket sparrow sprint stable starter station sunset switch tablet target ticket timber trophy tunnel turkey twitch update valley velvet village violet walnut weather welcome whisper window winter woodland`.split(' '),
  Bonfire: `achievement adventure multiplayer celebration championship wilderness accessibility actionpacked afterparty afterglow allstar animation applewood autumnal background battleground beautifully benchmark blacksmith blueberry brainstorm breakaway broadcast campfire candlelight challenger checkpoint cheerfully cloudburst cloudgaming collection comfortable community competition confidence connection cooperative cornfield countryside creativity crossplatform customization decoration destination determination downloadable dragonfly dreamscape elimination enchanted endurance entertainment equinox evergreen expedition experience exploration extraordinary fairground farmhouse fellowship firelight firstperson friendship frostbound frostbite fullscreen gameboard gamecapture gamechanger gameinvite gamekeeper gameplay gamertag gathering gingerbread grasshopper greenhouse groundcover halloween handcraft headphones heartbeat highlights homecoming hotchocolate independent invitation jackolantern leaderboard leafblower lightweight livestream matchmaking microphone middleware moonlight moonstone navigation neighborhood nightfall notification november objective observatory opponent orangeleaf overgrown partychat performance permission persimmon pinecone platformer playfully playground postseason powerhouse progression quickresume quicksand reconnect reflection refreshment registration relaxation remembrance resolution responsive restoration riverbank riverstone scoreboard screenshare screenshot scrollwork seasonpass semaphore semifinal settings shortcuts snowflake soundtrack spectators speedrunner spellcaster spotlight squashpatch starfield starlight steamworks storytelling strawberry subscription sunflower synchronize tabletop teammates tournament trailblazer translation treetops undergrowth underwater unlockable unsubscribe validation waterfall watermelon wayfinder wildflower windbreaker windswept wonderland woodcarving woodsmoke workshop worldwide wristband`.split(' '),
  'Final feast': [
    'jump into fall', 'one more round', 'cozy by the fire', 'bring your best game',
    'leaves on the breeze', 'teamwork makes magic', 'claim the crown', 'meet at the bonfire',
    'press play together', 'ready up the squad', 'save your adventure', 'unlock an achievement',
    'explore a new world', 'follow the forest path', 'gather by the campfire', 'race through autumn',
    'share the controller', 'find the hidden chest', 'keep the combo going', 'power up your party',
    'invite your friends', 'take the scenic route', 'watch the leaves fall', 'warm apple cider',
    'pumpkins on the porch', 'golden hour gaming', 'queue for another match', 'pass the hot cocoa',
    'chase the high score', 'build a cozy cabin', 'cross the finish line', 'catch the autumn breeze',
    'your next quest awaits', 'pick your woodland hero', 'type toward victory', 'welcome to the lobby',
    'camp beneath the stars', 'team up for adventure', 'leap across the river', 'collect the golden acorns',
    'celebrate every clear', 'a crisp morning quest', 'turn up the game audio', 'headsets at the ready',
    'meet your next teammate', 'bring snacks to game night', 'start a friendly rivalry', 'a forest full of pixels',
    'make room for your squad', 'orange leaves green dreams', 'roll for another chance', 'find your favorite avatar',
    'keep your keyboard cozy', 'the bonfire burns bright', 'sprint to the next checkpoint', 'harvest a new high score',
    'craft your autumn story', 'rest beside the oak tree', 'another level another leaf', 'a fresh season of play',
    'earn your autumn crown', 'cloud gaming by the fire', 'quick resume the adventure', 'join the party chat',
    'choose your next game', 'check your gamerscore', 'open your game library', 'your controller is ready',
    'maple trees and multiplayer', 'a harvest of achievements', 'the squad is all here', 'sunset over the race track',
    'a pocket full of pinecones', 'the final round begins', 'fast fingers warm hearts', 'build your winning streak',
    'a little friendly competition', 'take a walk through the orchard', 'follow the lantern light', 'green lights golden leaves',
    'race in forza horizon', 'build a minecraft cabin', 'explore the halo ring', 'sail the sea of thieves',
    'open xbox game bar', 'check the xbox app', 'browse xbox game pass', 'gear up for co op',
  ],
};

const mix = (preset: Difficulty) => [...new Set([...BASE_VOCABULARY[preset], ...MEME_WORDS[preset]])];
export const VOCABULARY: Record<Difficulty, readonly string[]> = {
  Acorn: mix('Acorn'), Harvest: mix('Harvest'), Bonfire: mix('Bonfire'), 'Final feast': mix('Final feast'),
};
