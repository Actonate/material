var config = require('../config');
var gulp = require('gulp');
var gutil = require('gulp-util');
var fs = require('fs');
var path = require('path');
var rename = require('gulp-rename');
var filter = require('gulp-filter');
var concat = require('gulp-concat');
var series = require('stream-series');
var util = require('../util');
var sassUtils = require('../../scripts/gulp-utils');
var sass = require('gulp-sass');
var minifyCss = require('gulp-minify-css');
var insert = require('gulp-insert');
var addsrc = require('gulp-add-src');
var gulpif = require('gulp-if');
var args = util.args;
var IS_DEV = require('../const')
  .IS_DEV;

exports.task = function() {

  var streams = [];
  var modules = args['modules'],
    overrides = args['override'],
    dest = args['output-dir'] || config.outputDir,
    filename = args['filename'] || 'angular-material',
    baseFiles = config.scssBaseFiles,
    layoutDest = dest + 'layouts/',
    scssPipe = undefined;

  gutil.log("Building css files...");

  // create SCSS file for distribution
  streams.push(
    scssPipe = gulp.src(getPaths())
    .pipe(util.filterNonCodeFiles())
    .pipe(filter(['**', '!**/*.css']))
    .pipe(filter(['**', '!**/*-theme.scss']))
    .pipe(filter(['**', '!**/*-attributes.scss']))
    .pipe(concat('angular-material-extended.scss'))
    .pipe(gulp.dest(dest)) // raw uncompiled SCSS
    .pipe(sass())
    .pipe(util.autoprefix())
    .pipe(insert.prepend(config.banner))
    .pipe(gulp.dest(dest)) // unminified
    .pipe(gulpif(!IS_DEV, minifyCss()))
    .pipe(rename({
      extname: '.min.css'
    }))
    .pipe(gulp.dest(dest)) // minified

  );

  return series(streams);


  function getPaths() {
    var paths = config.scssBaseExtendedFiles.slice();
    paths = paths.concat(config.scssExtendedPaths);
    overrides && paths.unshift(overrides);
    return paths;
  }
};
