const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const jbrPath = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const androidDir = path.join(__dirname, '..', 'android');

console.log('=== COMPILANDO ANDROID APP BUNDLE (.AAB) OFICIAL FIRMADO CON JDK 17 (JBR) ===');

const cmd = `gradlew.bat bundleRelease -Dorg.gradle.java.home="${jbrPath}" --no-daemon`;

try {
  const out = execSync(cmd, {
    cwd: androidDir,
    stdio: 'inherit'
  });
  console.log('✅ Gradle bundleRelease finalizado con ÉXITO!');
} catch (e) {
  console.error('Error durante la compilación:', e.message);
}

const aabPath = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (fs.existsSync(aabPath)) {
  const stat = fs.statSync(aabPath);
  console.log('🎉 AAB FIRMADO GENERADO!');
  console.log('Ruta:', aabPath);
  console.log('Tamaño:', (stat.size / (1024 * 1024)).toFixed(2) + ' MB');
  console.log('Fecha Modificación:', stat.mtime.toLocaleString());

  const publicDest = path.join(__dirname, '..', 'public', 'Portrack_v1.0.6_Signed.aab');
  fs.copyFileSync(aabPath, publicDest);
  console.log('Copiado a public:', publicDest);
} else {
  console.error('No se encontró el archivo .aab en:', aabPath);
}
