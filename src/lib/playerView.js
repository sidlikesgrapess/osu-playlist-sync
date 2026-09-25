// Which screen the player view shows (todo item 10). "Change Player" is a back step, not a
// delete: the loaded profile and its ticks stay in state while the user browses the results
// list again, so picking the same player brings it all back with no refetch. Only the trash
// (or a new name search) drops the player.

// `browsing` is true after Change Player. Returns what to render:
//   screen: 'profile' (card and sections), 'results' (the search results list) or 'empty'
//   backTo: the retained profile the user can return to, or null
export function playerViewScreen({ profile = null, resultsCount = 0, browsing = false } = {}) {
  const showProfile = Boolean(profile) && !browsing;
  if (showProfile) return { screen: 'profile', backTo: null };
  const backTo = profile || null;
  return { screen: resultsCount > 0 ? 'results' : 'empty', backTo };
}

// A pick from the results list is the retained player again: show it as it was.
export function isRetainedPlayer(profile, user) {
  return Boolean(profile && user) && String(profile.id) === String(user.id);
}
