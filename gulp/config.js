var args = require('minimist')(process.argv.slice(2));
var VERSION = args.version || require('../package.json')
  .version;

module.exports = {
  banner: '/*!\n' +
    ' * Angular Material Design\n' +
    ' * https://github.com/angular/material\n' +
    ' * @license MIT\n' +
    ' * v' + VERSION + '\n' +
    ' */\n',
  jsBaseFiles: [
    'src/core/**/*.js'
  ],
  jsFiles: [
    'src/core/**/*.js',
    'src/components/backdrop/**/*.js',
    'src/components/button/**/*.js',
    'src/components/card/**/*.js',
    'src/components/checkbox/**/*.js',
    'src/components/colors/**/*.js',
    'src/components/content/**/*.js',
    'src/components/icon/**/*.js',
    'src/components/input/**/*.js',
    'src/components/menu/**/*.js',
    'src/components/progressCircular/**/*.js',
    'src/components/radioButton/**/*.js',
    'src/components/select/**/*.js',
    'src/components/showHide/**/*.js',
    'src/components/swipe/**/*.js',
    'src/components/tabs/**/*.js',
    'src/components/toast/**/*.js',
    '!src/**/*.spec.js'
  ],
  jsExtendedFiles: [
    'src/components/autocomplete/**/*.js',
    'src/components/datePicker/**/*.js',
    'src/components/dialog/**/*.js',
    'src/components/gridList/**/*.js',
    'src/components/navBar/**/*.js',
    'src/components/progressLinear/**/*.js',
    'src/components/sidenav/**/*.js',
    'src/components/switch/**/*.js',
    'src/components/tooltip/**/*.js',
    'src/components/virtualRepeat/**/*.js',
    '!src/**/*.spec.js'
  ],
  mockFiles: [
    'test/angular-material-mocks.js'
  ],
  themeBaseFiles: [
    'src/core/style/variables.scss',
    'src/core/style/mixins.scss',
    'src/core/style/themes.scss'
  ],
  scssBaseFiles: [
    'src/core/style/color-palette.scss',
    'src/core/style/variables.scss',
    'src/core/style/mixins.scss',
    'src/core/style/structure.scss',
    'src/core/style/typography.scss',
    'src/core/style/layout.scss'
  ],
  scssBaseExtendedFiles: [
    'src/core/style/variables.scss',
    'src/core/style/mixins.scss'
  ],
  scssLayoutFiles: [
    'src/core/style/variables.scss',
    'src/core/style/mixins.scss',
    'src/core/style/layout.scss',
    'src/core/services/layout/layout.scss'
  ],
  scssLayoutAttributeFiles: [
    'src/core/style/variables.scss',
    'src/core/style/mixins.scss',
    'src/core/services/layout/layout-attributes.scss'
  ],
  scssPaths: [
    'src/components/card/**/*.scss',
    'src/components/backdrop/**/*.scss',
    'src/components/button/**/*.scss',
    'src/components/checkbox/**/*.scss',
    'src/components/colors/**/*.scss',
    'src/components/content/**/*.scss',
    'src/components/icon/**/*.scss',
    'src/components/input/**/*.scss',
    'src/components/menu/**/*.scss',
    'src/components/menuBar/**/*.scss',
    'src/components/progressCircular/**/*.scss',
    'src/components/radioButton/**/*.scss',
    'src/components/select/**/*.scss',
    'src/components/showHide/**/*.scss',
    'src/components/swipe/**/*.scss',
    'src/components/switch/**/*.scss',
    'src/components/tabs/**/*.scss',
    'src/components/toast/**/*.scss',
    'src/core/services/**/*.scss'
  ],
  scssExtendedPaths: [
    'src/components/datePicker/**/*.scss',
    'src/components/dialog/**/*.scss',
    'src/components/gridList/**/*.scss',
    'src/components/navBar/**/*.scss',
    'src/components/progressLinear/**/*.scss',
    'src/components/sidenav/**/*.scss',
    'src/components/tooltip/**/*.scss',
    'src/components/virtualRepeat/**/*.scss'
  ],
  cssIEPaths: ['src/**/ie_fixes.css'],
  paths: 'src/{components, services}/**',
  outputDir: 'dist/',
  demoFolder: 'demo-partials'
};
