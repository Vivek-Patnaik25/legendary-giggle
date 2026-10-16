import { FastifyReply } from 'fastify';

export interface HouseholdEvent {
  id: string;
  householdId: string;
  type: string;
  data: any;
  timestamp: string;
}

class EventHub {
  private subscribers: Map<string, Set<FastifyReply>> = new Map();
  private history: Map<string, HouseholdEvent[]> = new Map();
  private maxHistoryPerHousehold = 50;

  /**
   * Register a new SSE connection for a household
   */
  subscribe(householdId: string, reply: FastifyReply): void {
    if (!this.subscribers.has(householdId)) {
      this.subscribers.set(householdId, new Set());
    }
    const set = this.subscribers.get(householdId)!;
    set.add(reply);

    // Initial keepalive comment
    reply.raw.write(': connected\n\n');

    reply.raw.on('close', () => {
      set.delete(reply);
      if (set.size === 0) {
        this.subscribers.delete(householdId);
      }
    });
  }

  /**
   * Publish an event to all connected SSE clients of a household and record in history
   */
  publish(householdId: string, type: string, data: any): void {
    const event: HouseholdEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      householdId,
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    // Store in ring buffer
    if (!this.history.has(householdId)) {
      this.history.set(householdId, []);
    }
    const buffer = this.history.get(householdId)!;
    buffer.push(event);
    if (buffer.length > this.maxHistoryPerHousehold) {
      buffer.shift();
    }

    // Broadcast to SSE clients
    const clients = this.subscribers.get(householdId);
    if (clients) {
      const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
      for (const client of clients) {
        try {
          client.raw.write(payload);
        } catch {
          clients.delete(client);
        }
      }
    }
  }

  /**
   * Fallback for clients without SSE: poll for events newer than given timestamp
   */
  poll(householdId: string, sinceIso?: string): HouseholdEvent[] {
    const buffer = this.history.get(householdId) || [];
    if (!sinceIso) return buffer;
    const sinceTime = new Date(sinceIso).getTime();
    return buffer.filter(e => new Date(e.timestamp).getTime() > sinceTime);
  }
}

export const eventHub = new EventHub();
