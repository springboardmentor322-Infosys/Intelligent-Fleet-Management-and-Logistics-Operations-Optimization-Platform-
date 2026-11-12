const FLEET_DASHBOARD_ROLES = ['administrator', 'fleet_manager', 'dispatcher']

export function shouldShowFleetDashboard(role) {
  return FLEET_DASHBOARD_ROLES.includes(role)
}

export function getRoleLandingView(role) {
  if (role === 'driver') return 'drivers'
  if (role === 'dispatcher') return 'dispatcherDashboard'
  if (role === 'administrator') return 'admin'
  if (role === 'fleet_manager') return 'vehicles'
  return 'restricted'
}
