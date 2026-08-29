// Dijagnostika: direktno pozovi scoring funkcije za tacan korisnikov
// scenario — nosilac uzme 7 stihova na Sansu (vrednost 7), bez kontre,
// oba pratioca DODJEM, dele preostala 3 stiha (npr. 2 i 1).
import {
  calculateBulaChange,
  calculateBulaDistribution,
  calculateSupaForFollower,
} from '../src/scoring.js';
import { CONTRA_MULTIPLIERS } from '../src/constants.js';

const declarerTricks = 7;
const game = 'Sans';
const contraMult = CONTRA_MULTIPLIERS.NONE;
const refeMult = 1;

const declarerDelta = calculateBulaChange(declarerTricks, game, contraMult, refeMult);
console.log('declarerDelta (ocekivano -14):', declarerDelta);
const passed = declarerDelta < 0;
console.log('passed (ocekivano true):', passed);

const dist = calculateBulaDistribution(declarerDelta, {
  active: [0, 2],
  kontraš: null,
  pozivalac: null,
});
console.log('distribucija bula za pratioce (ocekivano +7 svaki):', dist);

const supe0 = calculateSupaForFollower(2, game, contraMult, refeMult);
const supe2 = calculateSupaForFollower(1, game, contraMult, refeMult);
console.log('supe pratilac0 (2 stiha):', supe0);
console.log('supe pratilac2 (1 stih):', supe2);
