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
