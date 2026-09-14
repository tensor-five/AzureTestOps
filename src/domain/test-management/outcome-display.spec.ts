import {describe,it,expect} from 'vitest';
import {outcomeDisplay} from './outcome-display.js';
describe('Shared outcome display',()=>{
  it.each([['Passed','✓'],['Failed','✗'],['Blocked','■'],['NotApplicable','N/A'],['NotRun','—'],['CustomOutcome','CUS'],['','—']])('displays %s consistently across views',(outcome,symbol)=>expect(outcomeDisplay(outcome).shortLabel).toBe(symbol));
});
