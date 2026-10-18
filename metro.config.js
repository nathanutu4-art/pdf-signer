// Menambahkan ekstensi .html sebagai asset Metro agar assets/pdfjs/viewer.html
// bisa di-bundle dan dibaca lewat expo-asset (kompatibel Expo Go).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('html')) {
  config.resolver.assetExts.push('html');
}

module.exports = config;
