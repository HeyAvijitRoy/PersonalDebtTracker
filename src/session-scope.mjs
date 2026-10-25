// Async decryption cannot be cancelled, so discard results from old sessions or
// older snapshots. This scope never stores account data or encryption keys.
export class SessionScope {
  generation = 0;
  sequence = 0;
  invalidate() { this.generation++; this.sequence = 0; }
  current(generation) { return generation === this.generation; }
  startRead() { return { generation: this.generation, sequence: ++this.sequence }; }
  accepts(ticket) { return this.current(ticket.generation) && ticket.sequence === this.sequence; }
}
