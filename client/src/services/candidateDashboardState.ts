const defaults = {
  view: 'assessments' as 'assessments' | 'interviews',
  assessmentFilter: 'available',
  interviewFilter: 'scheduled',
  search: '',
  sort: 'newest',
  showAll: false,
};

export function readCandidateDashboardState(key: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || '{}') ?? {};
    return {
      view: saved.view === 'interviews' ? ('interviews' as const) : defaults.view,
      assessmentFilter: [
        'all',
        'available',
        'in-progress',
        'upcoming',
        'completed',
        'closed',
      ].includes(saved.assessmentFilter)
        ? (saved.assessmentFilter as string)
        : defaults.assessmentFilter,
      interviewFilter: [
        'all',
        'in_progress',
        'scheduled',
        'completed',
        'cancelled',
        'expired',
      ].includes(saved.interviewFilter)
        ? (saved.interviewFilter as string)
        : defaults.interviewFilter,
      search: typeof saved.search === 'string' ? saved.search : '',
      sort: ['newest', 'oldest', 'soon'].includes(saved.sort)
        ? (saved.sort as string)
        : defaults.sort,
      showAll: saved.showAll === true,
    };
  } catch {
    return defaults;
  }
}
