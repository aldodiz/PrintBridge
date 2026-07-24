module.exports = {
  preset: '@react-native/jest-preset',
  // @react-native-async-storage/async-storage publica ESM sin transpilar en
  // node_modules; el preset de RN por defecto ignora node_modules al
  // transformar, hay que sacarlo de esa lista.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-native-async-storage)/)',
  ],
};
