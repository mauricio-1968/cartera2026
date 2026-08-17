const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const keytoolPath = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe';
const keystoreFile = path.join(__dirname, '..', 'android', 'app', 'portrack-release-key.jks');

if (fs.existsSync(keystoreFile)) {
  fs.unlinkSync(keystoreFile);
}

const cmd = `"${keytoolPath}" -genkeypair -v -keystore "${keystoreFile}" -keyalg RSA -keysize 2048 -validity 10000 -alias portrack -storepass PortrackKey2026Password -keypass PortrackKey2026Password -dname "CN=Mauricio Martinez, OU=Portrack, O=Portrack Inc, L=Santiago, ST=Santiago, C=CL"`;

console.log('Generando KeyStore de Firma Oficial para Google Play Console...');
try {
  const out = execSync(cmd);
  console.log(out.toString());
  console.log('✅ KeyStore de firma generado exitosamente en:', keystoreFile);
} catch (e) {
  console.error('Error generando KeyStore:', e.message);
}
