/**
 * The PlaceService class manages places in the application.
 *
 * A place is just the current state of the application which can be 
 * represented as an Object or a URL. For example, the place associated with:
 *
 *   http://localhost:5000/map/6/2/17/ALL/terrain/loss
 *
 * Can also be represented like this:
 * 
 *  zoom - 6
 *  lat - 2
 *  lng - 17
 *  iso - ALL
 *  maptype - terrain
 *  baselayers - loss
 *
 * The PlaceService class handles the following use cases:
 *
 * 1) New route updates views
 *   
 *   The Router receives a new URL and all application views need to be updated
 *   with the state encoded in the URL. 
 *   
 *   Here the router publishes the "Place/update" event passing in the route 
 *   name and route parameters. The PlaceService handles the event by 
 *   standardizing the route parameters and publishing them in a "Place/go" 
 *   event. Any presenters listening to the event receives the updated 
 *   application state and can update their views.
 *
 * 2) Updated view updates URL
 *   
 *   A View state changes (e.g., a new map zoom) and the URL needs to be 
 *   updated, not only with its new state, but from the stae of all views in 
 *   the application that provide state for URLs. 
 * 
 *   Here presenters publishe the "Place/register" event passing in a 
 *   reference to themselves. The PlaceService subscribes to the 
 *   "Place/register" event so that it can keep references to all presenters 
 *   that provide state. Then the view publishes the "Place/update" event
 *   passing in a "go" parameter. If "go" is false, the PlaceService will 
 *   update the URL. Otherwise it will publish the "Place/go" event which will 
 *   notify all subscribed presenters.
 *
 * @return {PlaceService} The PlaceService class
 */
define([
  'Class',
  'mps',
  'uri',
  'underscore'
], function (Class, mps, UriTemplate, _) {

  'use strict';

  var PlaceService = Class.extend({

    _uriTemplate: 'map{/zoom}{/lat}{/lng}{/iso}{/maptype}{/baselayers}{/sublayers}{?begin,end}',

    /**
     * Create new PlaceService with supplied MapLayerService and 
     * Backbone.Router.
     * 
     * @param  {MapLayerService} mapLayerService Instance of MapLayerService
     * @param  {Backbond.Router} router Instance of Backbone.Router
     * @return {PlaceService} Instance of PlaceService
     */
    init: function(mapLayerService, router) {
      this.mapLayerService = mapLayerService;
      this.router = router;
      this._presenters = [];
      this._subscribe();
    },

    /**
     * Subscribe to application events.
     */
    _subscribe: function() {
      mps.subscribe('Place/register', _.bind(function(presenter) {
        this._presenters = _.union(this._presenters, [presenter]);
      }, this));

      mps.subscribe('Place/update', _.bind(function(place) {
        this._handleNewPlace(place.name, place.params, place.go);
      }, this));
    },

    /**
     * Handles a new place.
     *
     * If go is true, fires a Place/go event passing in the place parameters 
     * which will include layers retrieved from the MapLayerService. Otherwise 
     * the URL is silently updated with a new route.
     * 
     * @param  {string} name The place name
     * @param  {Object} params The place parameters
     * @param  {[type]} go True to publish Place/go event, false to update URL
     */
    _handleNewPlace: function(name, params, go) {
      var route = null;
      var newPlace = {};

      if (!params) {
        params = this._getPresenterParams(this._presenters);
      }

      newPlace.params = this._standardizeParams(params);
      newPlace.name = name;

      if (go) {
        this._getMapLayers(
          params.baselayers,
          params.sublayers, 
          _.bind(function(layers) {
            newPlace.params.layers = layers;
            mps.publish('Place/go', [newPlace]);            
          }, this));
      } else {
        route = this._getRoute(newPlace.params);
        this.router.navigate(route, {silent: true});
      }
    },

    _getRoute: function(params) {
      return new UriTemplate(this._uriTemplate).fillFromObject(params);
    },

    /**
     * Return standardized representation of supplied params object.
     * 
     * @param  {Object} params The params to standardize
     * @return {Object} The standardized params.
     */
    _standardizeParams: function(params) {
      var p = _.clone(params);
      p.zoom = _.toNumber(params.zoom);
      p.lat = _.toNumber(params.lat);
      p.lng = _.toNumber(params.lng);
      p.maptype = params.maptype;
      p.begin = _.toNumber(params.begin);
      p.end = _.toNumber(params.end);
      p.iso = params.iso || 'ALL';
      return p;
    },

    /**
     * Return param object representing state from all registered presenters 
     * that implement getPlaceParams().
     * 
     * @param  {Array} presenters The registered presenters
     * @return {Object} Params representing state from all presenters 
     */
    _getPresenterParams: function(presenters) {
      var params = {};

      _.each(presenters, _.bind(function(presenter) {
        _.extend(params, presenter.getPlaceParams());
      }, this));

      return params;
    },

    /**
     * Return array of filter objects {slug:, category_slug:} for baselayers.
     * 
     * @param  {string} layers CSV list of baselayer slug names
     * @return {Array} Filter objects for baselayers  
     */
    _getBaselayerFilters: function(layers) {
      var baselayers = layers ? layers.split(',') : [];
      var filters = _.map(baselayers, function (name) {
        return {slug: name, category_slug: 'forest_clearing'};
      });
      
      return filters;
    },

    /**
     * Return array of filter objects {id:} for sublayers.
     * 
     * @param  {string} layers CSV list of sublayer ids
     * @return {Array} Filter objects for sublayers  
     */
    _getSublayerFilters: function(layers) {
      var sublayers = layers ? layers.split(',') : [];
      var filters = _.map(sublayers, function(id) {
        return {id: id};
      });
     
      return filters;
    },

    /**
     * Asynchronously get map layers objects from MapLayerService.
     * 
     * @param  {string}   baselayers CSV list of baselayer slug names
     * @param  {string}   sublayers  CSV list of sublayer ids
     * @param  {Function} callback  Called with layers
     */
    _getMapLayers: function(baselayers, sublayers, callback) {
      var baseWhere = this._getBaselayerFilters(baselayers);
      var subWhere = this._getSublayerFilters(sublayers);
      var where = _.union(baseWhere, subWhere);  // Preserves order

      // Get layers from MapLayerService
      this.mapLayerService.getLayers(
        where,
        _.bind(function(layers) {
          callback(layers);
        }, this),
        _.bind(function(error) {
          console.error(error);
          callback(undefined);
        }, this));
    }
  });
    
  return PlaceService;
});