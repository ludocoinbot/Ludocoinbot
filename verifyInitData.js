// Verifies that a request really came from Telegram's WebApp for THIS bot,
// and for the user it claims to be — per Telegram's official validation
// scheme (https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app).
// Without this check, anyone could call the API and claim to be any user ID.

const crypto = require('crypto');

function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userStr = params.get('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr); // { id, first_name, username, ... }
  } catch (e) {
    return null;
  }
}

module.exports = { verifyInitData };
