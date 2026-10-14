'use strict';
// Do not trust a TCP-open port or a single launcher-managed process as proof
// that it is safe to stop/reconfigure both local server services.
function servicesOwnedByLauncher(state){
 return Boolean(state?.metagame && state?.deploy && Array.isArray(state.owned)
  && state.owned.includes('metagame') && state.owned.includes('deploy'));
}
module.exports={servicesOwnedByLauncher};
