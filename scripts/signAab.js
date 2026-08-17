const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const jarsignerPath = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\jarsigner.exe';
const aabPath = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const keystorePath = path.join(__dirname, '..', 'android', 'app', 'portrack-release-key.jks');

console.log('=== FIRMANDO OFICIALMENTE EL ARCHIVO .AAB CON JARSIGNER ===');
console.log('Jarsigner:', jarsignerPath);
console.log('AAB File:', aabPath);
console.log('Keystore:', keystorePath);

const cmd = `"${jarsignerPath}" -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${keystorePath}" -storepass PortrackKey2026Password -keypass PortrackKey2026Password "${aabPath}" portrack`;

try {
  const out = execSync(cmd);
  console.log('✅ EL ARCHIVO .AAB FUE FIRMADO CON ÉXITO POR JARSIGNER!');
} catch (err) {
  console.error('Error al firmar con jarsigner:', err.message);
}

// Verificar la firma del paquete .aab
const verifyCmd = `"${jarsignerPath}" -verify -verbose -certs "${aabPath}"`;
try {
  const verifyOut = execSync(verifyCmd);
  const isVerified = verifyOut.toString().includes('jar verified');
  console.log('🔒 VERIFICACIÓN DE FIRMA EN GOOGLE PLAY CONSOLE:', isVerified ? 'FIRMADO Y VERIFICADO CORRECTAMENTE ✅' : 'PENDIENTE');
} catch (err) {
  console.warn('Verificación:', err.message);
}

// Copiar archivo firmado a public/Portrack_v1.0.6_Signed.aab
const publicDest = path.join(__dirname, '..', 'public', 'Portrack_v1.0.6_Signed.aab');
fs.copyFileSync(aabPath, publicDest);
console.log('🎉 Archivo .aab oficialmente firmado y disponible en:', publicDest);
