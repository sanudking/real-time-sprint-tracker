const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { connect, clear, disconnect } = require('./setup');

let app;
let httpServer;
let baseUrl;

beforeAll(async () => {
  await connect();
  app = require('../server');
  httpServer = app.httpServer;
  await new Promise((resolve) => {
    if (httpServer.listening) return resolve();
    httpServer.once('listening', resolve);
  });
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await disconnect();
  await new Promise((resolve) => httpServer.close(resolve));
});

beforeEach(async () => {
  await clear();
});

let counter = 0;
async function register(name = 'User') {
  counter += 1;
  const email = `${name.toLowerCase()}${counter}@test.io`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'TestPass123!' });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, email };
}

async function createWorkspace(token, name = 'Team') {
  const res = await request(app).post('/api/workspaces').set('Authorization', `Bearer ${token}`).send({ name });
  expect(res.status).toBe(201);
  return res.body;
}

function connectSocket(token) {
  const socket = ioClient(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const join = (socket, workspaceId) => new Promise((resolve) => socket.emit('workspace:join', workspaceId, resolve));
const nextEvent = (socket, event, ms = 5000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
  socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
});

describe('auth', () => {
  it('registers and logs in', async () => {
    const { email } = await register('Alice');
    const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    const { email } = await register('Bob');
    const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects a short password on register', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'x@test.io', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('never returns the password hash', async () => {
    const { email } = await register('Carol');
    const res = await request(app).post('/api/auth/login').send({ email, password: 'TestPass123!' });
    expect(res.body.user.password).toBeUndefined();
  });
});

describe('authorization', () => {
  it('blocks non-members from listing a workspace board', async () => {
    const owner = await register('Owner');
    const outsider = await register('Outsider');
    const ws = await createWorkspace(owner.token);
    const res = await request(app).get(`/api/tickets/workspace/${ws._id}`).set('Authorization', `Bearer ${outsider.token}`);
    expect(res.status).toBe(403);
  });

  it('only lets the creator or an admin delete a ticket', async () => {
    const owner = await register('Owner');
    const member = await register('Member');
    const ws = await createWorkspace(owner.token);
    await request(app).post(`/api/workspaces/${ws._id}/members`).set('Authorization', `Bearer ${owner.token}`).send({ email: member.email });

    const created = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Owner ticket', workspace: ws._id });
    expect(created.status).toBe(201);

    const denied = await request(app).delete(`/api/tickets/${created.body._id}`).set('Authorization', `Bearer ${member.token}`);
    expect(denied.status).toBe(403);

    const allowed = await request(app).delete(`/api/tickets/${created.body._id}`).set('Authorization', `Bearer ${owner.token}`);
    expect(allowed.status).toBe(200);
  });

  it('only lets admins manage members', async () => {
    const owner = await register('Owner');
    const member = await register('Member');
    const third = await register('Third');
    const ws = await createWorkspace(owner.token);
    await request(app).post(`/api/workspaces/${ws._id}/members`).set('Authorization', `Bearer ${owner.token}`).send({ email: member.email });

    const denied = await request(app).post(`/api/workspaces/${ws._id}/members`).set('Authorization', `Bearer ${member.token}`).send({ email: third.email });
    expect(denied.status).toBe(403);
  });

  it('refuses to remove the workspace owner', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const res = await request(app).delete(`/api/workspaces/${ws._id}/members/${owner.user.id}`).set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(400);
  });
});

describe('tickets', () => {
  it('edits title, priority, assignee and status', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const created = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Old title', workspace: ws._id });

    const res = await request(app).patch(`/api/tickets/${created.body._id}`).set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'New title', priority: 'HIGH', status: 'REVIEW' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New title');
    expect(res.body.priority).toBe('HIGH');
    expect(res.body.status).toBe('REVIEW');
  });

  it('rejects an empty title on edit', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const created = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Valid', workspace: ws._id });
    const res = await request(app).patch(`/api/tickets/${created.body._id}`).set('Authorization', `Bearer ${owner.token}`)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('comments', () => {
  it('creates and lists comments on a ticket', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Discuss me', workspace: ws._id });

    const posted = await request(app).post('/api/comments').set('Authorization', `Bearer ${owner.token}`)
      .send({ ticket: ticket.body._id, body: 'First thought' });
    expect(posted.status).toBe(201);

    const listed = await request(app).get(`/api/comments/ticket/${ticket.body._id}`).set('Authorization', `Bearer ${owner.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].body).toBe('First thought');
  });

  it('rejects an empty comment', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'T', workspace: ws._id });
    const res = await request(app).post('/api/comments').set('Authorization', `Bearer ${owner.token}`)
      .send({ ticket: ticket.body._id, body: '   ' });
    expect(res.status).toBe(400);
  });
});

describe('realtime', () => {
  it('rejects a socket with no token', async () => {
    const socket = ioClient(baseUrl, { transports: ['websocket'], reconnection: false });
    const message = await new Promise((resolve) => socket.once('connect_error', (e) => resolve(e.message)));
    expect(message).toMatch(/Authentication required/i);
    socket.close();
  });

  it('rejects a socket with an invalid token', async () => {
    const socket = ioClient(baseUrl, { auth: { token: 'garbage' }, transports: ['websocket'], reconnection: false });
    const message = await new Promise((resolve) => socket.once('connect_error', (e) => resolve(e.message)));
    expect(message).toMatch(/Invalid or expired/i);
    socket.close();
  });

  it('refuses a room join for a non-member', async () => {
    const owner = await register('Owner');
    const outsider = await register('Outsider');
    const ws = await createWorkspace(owner.token);

    const socket = await connectSocket(outsider.token);
    const ack = await join(socket, ws._id);
    expect(ack.ok).toBe(false);
    expect(ack.message).toMatch(/not a workspace member/i);
    socket.close();
  });

  it('broadcasts ticket status changes to other members only', async () => {
    const owner = await register('Owner');
    const member = await register('Member');
    const ws = await createWorkspace(owner.token);
    await request(app).post(`/api/workspaces/${ws._id}/members`).set('Authorization', `Bearer ${owner.token}`).send({ email: member.email });

    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Broadcast me', workspace: ws._id });

    const ownerSocket = await connectSocket(owner.token);
    const memberSocket = await connectSocket(member.token);
    await join(ownerSocket, ws._id);
    await join(memberSocket, ws._id);

    const received = nextEvent(ownerSocket, 'ticket:updated');
    await request(app).patch(`/api/tickets/${ticket.body._id}/status`).set('Authorization', `Bearer ${member.token}`)
      .send({ status: 'DONE' });

    const payload = await received;
    expect(payload.ticket.status).toBe('DONE');
    expect(payload.actorId).toBe(member.user.id);

    ownerSocket.close();
    memberSocket.close();
  });

  it('does not leak a board to a socket that never joined the room', async () => {
    const owner = await register('Owner');
    const other = await register('Other');
    const ws = await createWorkspace(owner.token);
    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Private', workspace: ws._id });

    const ownerSocket = await connectSocket(owner.token);
    await join(ownerSocket, ws._id);

    // `other` is connected but not in the room.
    const otherSocket = await connectSocket(other.token);
    let leaked = false;
    otherSocket.on('ticket:updated', () => { leaked = true; });

    await request(app).patch(`/api/tickets/${ticket.body._id}/status`).set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'REVIEW' });

    await new Promise((r) => setTimeout(r, 300));
    expect(leaked).toBe(false);

    ownerSocket.close();
    otherSocket.close();
  });

  it('broadcasts new comments to the workspace room', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Comment me', workspace: ws._id });

    const ownerSocket = await connectSocket(owner.token);
    await join(ownerSocket, ws._id);

    const received = nextEvent(ownerSocket, 'comment:created');
    await request(app).post('/api/comments').set('Authorization', `Bearer ${owner.token}`)
      .send({ ticket: ticket.body._id, body: 'Live comment' });

    const payload = await received;
    expect(payload.comment.body).toBe('Live comment');
    expect(payload.ticketId).toBe(ticket.body._id);

    ownerSocket.close();
  });
});

describe('ticket metadata', () => {
  it('stores labels, due date, points and dedupes labels', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const res = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Rich ticket', workspace: ws._id, labels: ['Bug', 'bug', 'UI'], points: 5, dueDate: '2030-01-15' });

    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual(['bug', 'ui']);
    expect(res.body.points).toBe(5);
    expect(res.body.dueDate.slice(0, 10)).toBe('2030-01-15');
  });

  it('rejects an invalid due date', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const created = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'T', workspace: ws._id });
    const res = await request(app).patch(`/api/tickets/${created.body._id}`).set('Authorization', `Bearer ${owner.token}`)
      .send({ dueDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('adds, completes and removes subtasks', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Chunky', workspace: ws._id });

    const added = await request(app).post(`/api/tickets/${ticket.body._id}/subtasks`).set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Write the migration' });
    expect(added.status).toBe(201);
    expect(added.body.subtasks).toHaveLength(1);

    const subId = added.body.subtasks[0]._id;
    const toggled = await request(app).patch(`/api/tickets/${ticket.body._id}/subtasks/${subId}`).set('Authorization', `Bearer ${owner.token}`)
      .send({ done: true });
    expect(toggled.body.subtasks[0].done).toBe(true);

    const removed = await request(app).delete(`/api/tickets/${ticket.body._id}/subtasks/${subId}`).set('Authorization', `Bearer ${owner.token}`);
    expect(removed.body.subtasks).toHaveLength(0);
  });

  it('records an activity trail for edits', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Track me', workspace: ws._id });
    await request(app).patch(`/api/tickets/${ticket.body._id}/status`).set('Authorization', `Bearer ${owner.token}`).send({ status: 'DONE' });

    const res = await request(app).get(`/api/tickets/${ticket.body._id}/activity`).set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.some(a => a.action === 'moved')).toBe(true);
  });

  it('archives and restores a ticket', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Old work', workspace: ws._id });

    await request(app).patch(`/api/tickets/${ticket.body._id}/archive`).set('Authorization', `Bearer ${owner.token}`).send({ archived: true });
    const active = await request(app).get(`/api/tickets/workspace/${ws._id}`).set('Authorization', `Bearer ${owner.token}`);
    expect(active.body).toHaveLength(0);

    const archived = await request(app).get(`/api/tickets/workspace/${ws._id}?archived=true`).set('Authorization', `Bearer ${owner.token}`);
    expect(archived.body).toHaveLength(1);
  });

  it('bulk-updates several tickets at once', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const a = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`).send({ title: 'A', workspace: ws._id });
    const b = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`).send({ title: 'B', workspace: ws._id });

    const res = await request(app).post('/api/tickets/bulk').set('Authorization', `Bearer ${owner.token}`)
      .send({ ids: [a.body._id, b.body._id], priority: 'HIGH', status: 'REVIEW' });
    expect(res.status).toBe(200);
    expect(res.body.every(t => t.priority === 'HIGH' && t.status === 'REVIEW')).toBe(true);
  });

  it('exports the board as CSV', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Comma, "quoted" title', workspace: ws._id });

    const res = await request(app).get(`/api/tickets/workspace/${ws._id}/export`).set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.split('\n')[0]).toContain('title,status,priority');
    expect(res.text).toContain('"Comma, ""quoted"" title"');
  });

  it('reports workspace stats and my-work', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Mine', workspace: ws._id, assignedTo: owner.user.id, points: 3, status: 'DONE' });

    const stats = await request(app).get(`/api/workspaces/${ws._id}/stats`).set('Authorization', `Bearer ${owner.token}`);
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(1);
    expect(stats.body.completion).toBe(100);
    expect(stats.body.points.total).toBe(3);

    const mine = await request(app).get('/api/workspaces/my-work').set('Authorization', `Bearer ${owner.token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.tickets).toHaveLength(1);
  });

  it('notifies an assignee and mentions', async () => {
    const owner = await register('Owner');
    const member = await register('Member');
    const ws = await createWorkspace(owner.token);
    await request(app).post(`/api/workspaces/${ws._id}/members`).set('Authorization', `Bearer ${owner.token}`).send({ email: member.email });

    const ticket = await request(app).post('/api/tickets').set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'Hand off', workspace: ws._id, assignedTo: member.user.id });
    expect(ticket.status).toBe(201);

    const assigneeNotes = await request(app).get('/api/notifications').set('Authorization', `Bearer ${member.token}`);
    expect(assigneeNotes.body.notifications.some(n => n.type === 'ASSIGNED')).toBe(true);

    await request(app).post('/api/comments').set('Authorization', `Bearer ${owner.token}`)
      .send({ ticket: ticket.body._id, body: `hey @${member.user.name} can you take this?` });

    const afterMention = await request(app).get('/api/notifications').set('Authorization', `Bearer ${member.token}`);
    expect(afterMention.body.notifications.some(n => n.type === 'MENTION')).toBe(true);
  });

  it('only lets admins rename a workspace', async () => {
    const owner = await register('Owner');
    const member = await register('Member');
    const ws = await createWorkspace(owner.token);
    await request(app).post(`/api/workspaces/${ws._id}/members`).set('Authorization', `Bearer ${owner.token}`).send({ email: member.email });

    const denied = await request(app).patch(`/api/workspaces/${ws._id}`).set('Authorization', `Bearer ${member.token}`).send({ name: 'Nope' });
    expect(denied.status).toBe(403);

    const allowed = await request(app).patch(`/api/workspaces/${ws._id}`).set('Authorization', `Bearer ${owner.token}`).send({ name: 'Renamed' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.name).toBe('Renamed');
  });

  it('broadcasts presence to the room', async () => {
    const owner = await register('Owner');
    const ws = await createWorkspace(owner.token);
    const socket = await connectSocket(owner.token);

    const seen = nextEvent(socket, 'presence:update');
    await join(socket, ws._id);
    const payload = await seen;
    expect(payload.users.map(u => u.name)).toContain('Owner');

    socket.close();
  });
});
