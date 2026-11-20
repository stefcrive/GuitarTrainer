export interface WorkspaceNavigation {
  pathname: string
  search: string
  pages: Record<string, string>
}

// A bare link to a previously visited page resumes it. A new deep link replaces
// only that page's parameters; an explicit query change on the current page wins.
export function retainWorkspaceNavigation(previous: WorkspaceNavigation, pathname: string, search: string, supported: boolean): WorkspaceNavigation {
  if (previous.pathname === pathname && previous.search === search) return previous
  const saved = previous.pages[pathname]
  const query = search || (previous.pathname !== pathname ? saved : '') || ''
  return {
    pathname,
    search,
    pages: supported ? { ...previous.pages, [pathname]: query } : previous.pages
  }
}
