const DM_CLOSED = 50007;

// Never throws: closed DMs are a normal outcome.
async function sendDM(client, userId, payload) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(payload);
    return { ok: true };
  } catch (error) {
    return { ok: false, closed: error?.code === DM_CLOSED, error };
  }
}

module.exports = { sendDM, DM_CLOSED };
