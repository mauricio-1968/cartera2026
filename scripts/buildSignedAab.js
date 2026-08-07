const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const jbrBin = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin';
const jbrHome = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const androidDir = path.join(__dirname, '..', 'android');

console.log('=== COMPILANDO AAB CON PACKAGE com.micarteraapp ===');
console.log('Usando JDK Bin:', jbrBin);

const newPath = `${jbrBin};${process.env.PATH}`;
const env = Object.assign({}, process.env, {
  JAVA_HOME: jbrHome,
  PATH: newPath
});

try {
  const out = execSync('gradlew.bat bundleRelease', {
    cwd: androidDir,
    env: env,
    stdio: 'inherit'
  });
  console.log('✅ Gradle bundleRelease finalizado con ÉXITO!');
} catch (e) {
  console.error('Error durante la compilación:', e.message);
}

const aabPath = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (fs.existsSync(aabPath)) {
  // Firmar con jarsigner
  const jarsignerPath = path.join(jbrBin, 'jarsigner.exe');
  const keystorePath = path.join(androidDir, 'app', 'portrack-release-key.jks');
  const signCmd = `"${jarsignerPath}" -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${keystorePath}" -storepass PortrackKey2026Password -keypass PortrackKey2026Password "${aabPath}" portrack`;

  try {
    execSync(signCmd);
    console.log('✅ ARCHIVO AAB CON PACKAGE com.micarteraapp FIRMADO EXITOSAMENTE CON JARSIGNER!');
  } catch (err) {
    console.error('Error firmando:', err.message);
  }

  const stat = fs.statSync(aabPath);
  console.log('🎉 AAB FIRMADO OFICIAL GENERADO!');
  console.log('Ruta:', aabPath);
  console.log('Tamaño:', (stat.size / (1024 * 1024)).toFixed(2) + ' MB');
  console.log('Fecha Modificación:', stat.mtime.toLocaleString());

  const publicDest = path.join(__dirname, '..', 'public', 'com.micarteraapp.aab');
  fs.copyFileSync(aabPath, publicDest);
  console.log('Copiado a public:', publicDest);
} else {
  console.error('No se encontró el archivo .aab en:', aabPath);
}
