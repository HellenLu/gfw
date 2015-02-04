/**
 * The WWF layer module for use on canvas.
 *
 * @return WWFLayer class (extends CanvasLayerClass)
 */
define([
  'abstract/layer/CartoDBLayerClass',
  'text!map/cartocss/wwf.cartocss'
], function(CartoDBLayerClass, wwfCartoCSS) {

  'use strict';

  var WWFLayer = CartoDBLayerClass.extend({

    options: {
      sql: 'SELECT the_geom_webmercator, eco_name as name, realm, biome, \'{tableName}\' AS layer FROM {tableName}',
      infowindow: true,
      interactivity: 'name, realm, biome',
      cartocss: wwfCartoCSS
    }

  });

  return WWFLayer;

});
