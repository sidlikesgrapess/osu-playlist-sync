# 12 Full-length player sections, sticky headers

## Decisions

- USER: Sticky stack. Each section (Best, Most played, Favourites) shows all its rows at full
  length, with no 400px inner scroll box. Its header docks under the navbar and search bar
  while you scroll it, and the next section's header pushes it out, like VS Code sticky
  scroll. The motion matches the search bar's easing.
- USER: every section header also has a collapse button. Collapsing hides that section's rows
  and keeps its header, and the button works from the docked header too. The animation is
  smooth.
