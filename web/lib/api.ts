// Same-origin relative calls to /api/proxy/... — the proxy route injects X-User-Id.
// Each method maps 1:1 to a backend /api/v1/<path> endpoint.

async function req(path: string, options?: RequestInit) {
  const res = await fetch(`/api/proxy/${path}`, options)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(message)
  }
  return data
}

const get = (path: string) => req(path)
const post = (path: string, body?: unknown) =>
  req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const put = (path: string, body?: unknown) =>
  req(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const del = (path: string) => req(path, { method: 'DELETE' })

function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return ''
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

const api = {
  // Dashboard / overview
  getDashboardOverview: () => get('dashboard/overview'),

  // Incidents
  getIncidents: () => get('incidents'),
  createIncident: (data: unknown) => post('incidents', data),
  getIncident: (id: string) => get(`incidents/${id}`),
  updateIncident: (id: string, data: unknown) => put(`incidents/${id}`, data),
  deleteIncident: (id: string) => del(`incidents/${id}`),
  getAnchors: (id: string) => get(`incidents/${id}/anchors`),
  createAnchor: (id: string, data: unknown) => post(`incidents/${id}/anchors`, data),
  updateAnchor: (id: string, anchorId: string, data: unknown) => put(`incidents/${id}/anchors/${anchorId}`, data),
  deleteAnchor: (id: string, anchorId: string) => del(`incidents/${id}/anchors/${anchorId}`),
  updateFacts: (id: string, data: unknown) => put(`incidents/${id}/facts`, data),
  recomputeObligations: (id: string) => post(`incidents/${id}/recompute`),

  // Obligations
  getObligations: (params?: Record<string, string | number | undefined | null>) => get(`obligations${qs(params)}`),
  getObligation: (id: string) => get(`obligations/${id}`),
  updateObligation: (id: string, data: unknown) => put(`obligations/${id}`, data),

  // Artifacts
  getArtifacts: (params?: Record<string, string | number | undefined | null>) => get(`artifacts${qs(params)}`),
  getArtifact: (id: string) => get(`artifacts/${id}`),
  createArtifact: (data: unknown) => post('artifacts', data),
  updateArtifact: (id: string, data: unknown) => put(`artifacts/${id}`, data),
  deleteArtifact: (id: string) => del(`artifacts/${id}`),
  getArtifactVersions: (id: string) => get(`artifacts/${id}/versions`),

  // Signoffs
  getSignoffs: (artifactId: string) => get(`signoffs?artifactId=${artifactId}`),
  requestSignoff: (data: unknown) => post('signoffs', data),
  decideSignoff: (id: string, data: unknown) => put(`signoffs/${id}`, data),

  // Deliveries
  getDeliveries: (params?: Record<string, string | number | undefined | null>) => get(`deliveries${qs(params)}`),
  recordDelivery: (data: unknown) => post('deliveries', data),

  // Contracts
  getContracts: () => get('contracts'),
  createContract: (data: unknown) => post('contracts', data),
  getContract: (id: string) => get(`contracts/${id}`),
  updateContract: (id: string, data: unknown) => put(`contracts/${id}`, data),
  deleteContract: (id: string) => del(`contracts/${id}`),
  getContractObligations: (incidentId: string) => get(`contracts/obligations?incidentId=${incidentId}`),
  attachContract: (data: unknown) => post('contracts/obligations', data),

  // Populations
  getPopulations: (incidentId: string) => get(`populations?incidentId=${incidentId}`),
  savePopulation: (data: unknown) => post('populations', data),
  deletePopulation: (id: string) => del(`populations/${id}`),

  // Jurisdictions
  getJurisdictions: () => get('jurisdictions'),
  getJurisdiction: (id: string) => get(`jurisdictions/${id}`),

  // Rules
  getRules: (params?: Record<string, string | number | undefined | null>) => get(`rules${qs(params)}`),
  getRule: (id: string) => get(`rules/${id}`),
  createRule: (data: unknown) => post('rules', data),
  updateRule: (id: string, data: unknown) => put(`rules/${id}`, data),
  deleteRule: (id: string) => del(`rules/${id}`),

  // Regulators
  getRegulators: (params?: Record<string, string | number | undefined | null>) => get(`regulators${qs(params)}`),
  createRegulator: (data: unknown) => post('regulators', data),
  updateRegulator: (id: string, data: unknown) => put(`regulators/${id}`, data),
  deleteRegulator: (id: string) => del(`regulators/${id}`),

  // Templates
  getTemplates: () => get('templates'),
  getTemplate: (id: string) => get(`templates/${id}`),
  createTemplate: (data: unknown) => post('templates', data),
  updateTemplate: (id: string, data: unknown) => put(`templates/${id}`, data),
  deleteTemplate: (id: string) => del(`templates/${id}`),

  // Tasks
  getTasks: (incidentId: string) => get(`tasks?incidentId=${incidentId}`),
  getMyTasks: () => get('tasks/mine'),
  createTask: (data: unknown) => post('tasks', data),
  updateTask: (id: string, data: unknown) => put(`tasks/${id}`, data),
  deleteTask: (id: string) => del(`tasks/${id}`),

  // Notifications
  getNotifications: () => get('notifications'),
  markNotificationRead: (id: string) => put(`notifications/${id}/read`),
  markAllNotificationsRead: () => put('notifications/read-all'),

  // Comments
  getComments: (entityType: string, entityId: string) => get(`comments?entityType=${entityType}&entityId=${entityId}`),
  createComment: (data: unknown) => post('comments', data),
  updateComment: (id: string, data: unknown) => put(`comments/${id}`, data),
  deleteComment: (id: string) => del(`comments/${id}`),

  // Attachments
  getAttachments: (entityType: string, entityId: string) => get(`attachments?entityType=${entityType}&entityId=${entityId}`),
  createAttachment: (data: unknown) => post('attachments', data),
  deleteAttachment: (id: string) => del(`attachments/${id}`),

  // Activity
  getActivity: (params?: Record<string, string | number | undefined | null>) => get(`activity${qs(params)}`),

  // Packs
  getPacks: (incidentId: string) => get(`packs?incidentId=${incidentId}`),
  getPack: (id: string) => get(`packs/${id}`),
  generatePack: (data: unknown) => post('packs', data),

  // Views
  getViews: () => get('views'),
  createView: (data: unknown) => post('views', data),
  updateView: (id: string, data: unknown) => put(`views/${id}`, data),
  deleteView: (id: string) => del(`views/${id}`),

  // Exposure
  getExposure: () => get('exposure'),
  saveExposure: (data: unknown) => post('exposure', data),
  deleteExposure: (id: string) => del(`exposure/${id}`),
  previewExposure: (params?: Record<string, string | number | undefined | null>) => get(`exposure/preview${qs(params)}`),

  // War room
  getWarRoom: (incidentId: string) => get(`warroom/${incidentId}`),

  // Analytics
  getAnalyticsSummary: () => get('analytics/summary'),
  getIncidentAnalytics: (id: string) => get(`analytics/incident/${id}`),

  // Seed
  seedSample: () => post('seed/sample'),

  // Billing
  getBillingPlan: () => get('billing/plan'),
  startCheckout: () => post('billing/checkout'),
  openPortal: () => post('billing/portal'),
}

export default api
