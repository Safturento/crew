/** The supervisor process health, backing the supervisor drawer's header. */
export interface SupervisorView {
  online: boolean;
  lastSeen: number | null;
}
