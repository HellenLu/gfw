define([
  'jquery',
  'backbone',
  'underscore',
  'moment',
  'handlebars',
  'uri',
  'core/View',
  'mps',
  'helpers/numbersHelper',
  'services/CountryService',
  'common/views/LineGraphView',
  'text!countries/templates/widgets/treeCoverLossAlerts.handlebars',
  'text!countries/templates/widgets/treeCoverLossAlertsCard.handlebars'
], function(
  $,
  Backbone,
  _,
  moment,
  Handlebars,
  UriTemplate,
  View,
  mps,
  NumbersHelper,
  CountryService,
  LineGraphView,
  tpl,
  cardTpl) {

  'use strict';

  var WIDGETS_NUM = 5;
  var API_HOST = window.gfw.config.GFW_API_HOST_PROD;
  var CARTO_API_HOST = window.gfw.config.CARTO_API_HOST;

  var ORIGIN_LABELS = {
    month: 'By month',
    wdpa: 'Within protected areas',
    wdma: 'Within moratorium areas',
    onpeat: 'On peat'
  }

  var DATASETS = {
    month: {
      glad: '5608af77-1038-4d5d-8084-d5f49e8323a4',
      terrai: '75832571-44e7-41a3-96cf-4368a7f07075'
    },
    wdpa: {
      glad: '7bcf0880-c00d-4726-aae2-d455a9decbce',
      terrai: 'c6a6d80f-cf7f-48b7-8e48-ec6ffcd5ae71'
    },
    wdma: {
      glad: '439fc0f1-ba89-448d-9fc5-d4e61b60f5e7',
      terrai: '6b9f5936-6750-4eaa-bcef-0d8da60046cb'
    },
    onpeat: {
      glad: '439fc0f1-ba89-448d-9fc5-d4e61b60f5e7',
      terrai: '383bccb7-3004-4494-9cf9-5b8e034908fb'
    },
  }

  var QUERIES = {
    month: {
      glad: {
        top: '/query?sql=SELECT SUM (alerts) as alerts, year, state_id FROM {dataset} WHERE year={year} AND country_iso=\'{iso}\' GROUP BY state_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query?sql=select sum(alerts) as alerts, year, month, state_id from {dataset} WHERE country_iso=\'{iso}\' AND year={year} AND state_id IN({ids}) AND group by state_id, month, year ORDER BY month ASC'
      },
      terrai: {
        top: '/query/{dataset}?sql=SELECT SUM (count) as alerts, year, state_id FROM data WHERE year={year} AND country_id=\'{iso}\' GROUP BY state_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query/{dataset}?sql=select sum(count) as alerts, year, month, state_id from data WHERE country_id=\'{iso}\' AND year={year} AND state_id IN({ids}) AND group by state_id, month, year ORDER BY month ASC'
      }
    },
    wdpa: {
      glad: {
        top: '/query?sql=SELECT SUM (alerts) as alerts, year, wdpa_id, state_id FROM {dataset} WHERE year={year} AND country_iso=\'{iso}\' GROUP BY wdpa_id, state_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query?sql=select sum(alerts) as alerts, year, month, wdpa_id from {dataset} WHERE country_iso=\'{iso}\' AND year={year} AND wdpa_id IN({ids}) AND group by wdpa_id, month, year ORDER BY month ASC',
        names: 'SELECT name WHERE wdpa_pid IN({wdpaIds})'
      },
      terrai: {
        top: '/query?sql=SELECT SUM (count) as alerts, year, wdpa_id FROM {dataset} WHERE year={year} AND country_id=\'{iso}\' GROUP BY wdpa_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query?sql=select sum(count) as alerts, year, month, wdpa_id from {dataset} WHERE country_id=\'{iso}\' AND year={year} AND wdpa_id IN({ids}) AND group by wdpa_id, month, year ORDER BY month ASC',
        names: 'SELECT name WHERE wdpa_pid IN({wdpaIds})'
      }
    },
    wdma: {
      glad: {
        top: '/query?sql=SELECT SUM (alerts) as alerts, year, state_id FROM {dataset} WHERE year={year} AND country_iso=\'{iso}\' GROUP BY state_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query?sql=select sum(alerts) as alerts, year, month, state_id from {dataset} WHERE country_iso=\'{iso}\' AND year={year} AND state_id IN({ids}) AND group by state_id, month, year ORDER BY month ASC'
      },
      terrai: {
        top: '/query?sql=SELECT SUM (count) as alerts, year, state_id FROM {dataset} WHERE year={year} AND country_id=\'{iso}\' GROUP BY state_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query?sql=select sum(count) as alerts, year, month, state_id from {dataset} WHERE country_id=\'{iso}\' AND year={year} AND state_id IN({ids}) AND group by state_id, month, year ORDER BY month ASC'
      }
    },
    onpeat: {
      glad: {
        top: '/query?sql=SELECT SUM (alerts) as alerts, year, state_id FROM {dataset} WHERE year={year} AND country_iso=\'{iso}\' GROUP BY state_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query?sql=select sum(alerts) as alerts, year, month, state_id from {dataset} WHERE country_iso=\'{iso}\' AND year={year} AND state_id IN({ids}) AND group by state_id, month, year ORDER BY month ASC'
      },
      terrai: {
        top: '/query?sql=SELECT SUM (alerts) as alerts, year, state_id FROM {dataset} WHERE year={year} AND country_iso=\'{iso}\' GROUP BY state_id ORDER BY alerts DESC limit {widgetsNum}',
        data: '/query?sql=select sum(alerts) as alerts, year, month, state_id from {dataset} WHERE country_iso=\'{iso}\' AND year={year} AND state_id IN({ids}) AND group by state_id, month, year ORDER BY month ASC'
      }
    }
  }

  var TreeCoverLossView = View.extend({
    el: '#widget-tree-cover-loss-alerts',

    events: {
      'change #cla-data-shown-select': 'onOriginSelectChange',
      'click .data-source-filter': 'changeDataSourceFilter'
    },

    status: new (Backbone.Model.extend({
      defaults: {
        origin: 'month',
        source: 'glad',
        layerLink: 'umd_as_it_happens',
        sourceLink: 'glad-alerts'
      }
    })),

    template: Handlebars.compile(tpl),
    cardTemplate: Handlebars.compile(cardTpl),

    defaultOrigins: ['month', 'wdpa'],
    originsByCountry: {
      IDN: ['wdma', 'onpeat'],
      MYS: ['onpeat']
    },

    _subscriptions:[
      {
        'Regions/update': function(value) {

        }
      },
    ],

    initialize: function(params) {
      View.prototype.initialize.apply(this);
      this.iso = params.iso;
      this.latitude = params.latitude;
      this.longitude = params.longitude;
      this.start();
    },

    start: function() {
      this.render();
      this.cache();
      this._getData().done(function(data) {
        this.data = data;
        this._initWidgets();
      }.bind(this));
    },

    render: function() {
      this.$el.html(this.template({
        widgetsNum: 5,
        origins: this.getOriginOptions(this.iso)
      }));
      this.$el.removeClass('-loading');
    },

    cache: function(iso) {
      this.$widgets = this.$('#cla-graphs-container');
    },

    getOriginOptions: function(iso) {
      var origins = this.defaultOrigins;
      if (this.originsByCountry[iso]) {
        origins = origins.concat(this.originsByCountry[iso]);
      }
      return origins.map(function(origin) {
        return {
          label: ORIGIN_LABELS[origin],
          value: origin
        }
      });
    },

    onOriginSelectChange: function(e) {
      this.$widgets.addClass('-loading');
      $('.back-loading-loss-alerts').addClass('-show');
      var value = e.currentTarget.value;
      this.status.set('origin', value);
      this.updateData();
    },

    changeDataSourceFilter: function(e) {
      this.$widgets.addClass('-loading');
      $('.back-loading-loss-alerts').addClass('-show');
      $('.data-source-filter').each(function(i, obj) {
        if ($(obj).hasClass('active')) {
          $(this).removeClass('active');
        }
      });
      this.status.set('source', $(e.target).attr('data-source'));
      this.status.set('layerLink', $(e.target).attr('data-layerLink'));
      this.status.set('sourceLink', $(e.target).attr('data-sourceLink'));

      $(e.target).addClass('active');
      this.updateData();
    },

    updateData: function() {
      this._getData().done(function(data) {
        this.data = data;
        this._initWidgets();
      }.bind(this));
    },

    _initWidgets: function() {
      if (this.data) {
        var sourceLink = this.status.get('sourceLink');
        var countryLink = this.iso;
        var regionLink = $('#areaSelector').val() === 'default' ? 0 : $('#areaSelector').val();
        var layerLink = this.status.get('layerLink');
        this.widgetViews = [];
        this.$widgets.html('');
        var keys = Object.keys(this.data);
        keys.forEach(function(key, index) {
          this.$widgets.append(this.cardTemplate({
            ranking: index + 1,
            alerts: this.data[key].alerts,
            name: this.data[key].name,
            linkImagery: '/map/9/'+this.longitude+'/'+this.latitude+'/'+countryLink+'-'+regionLink+'/grayscale/'+layerLink+'/685?tab=hd-tab&hresolution=eyJ6b29tIjo5LCJzYXRlbGxpdGUiOiJoaWdocmVzIiwiY29sb3JfZmlsdGVyIjoicmdiIiwicmVuZGVyZXIiOiJSR0IgKFJlZCBHcmVlbiBCbHVlKSIsInNlbnNvcl9wbGF0Zm9ybSI6InNlbnRpbmVsLTIiLCJzZW5zb3JfbmFtZSI6IlNlbnRpbmVsIDIiLCJjbG91ZCI6IjMwIiwibWluZGF0ZSI6IjIwMTctMDEtMjUiLCJtYXhkYXRlIjoiMjAxNy0wNS0yNSJ9',
            linkSubscribe: '/my_gfw/subscriptions/new?aoi=country&datasets='+sourceLink+'&country='+countryLink+'&region='+regionLink+'',
          }));
          this.widgetViews.push(new LineGraphView({
            el: '#cover-loss-alert-card-' + (index + 1),
            data: this.data[key].data,
            xAxisLabels: false
          }));
        }.bind(this));
      } else {
        this.$widgets.addClass('.-no-data');
        this.$widgets.html('<p>There are no alerts</p>');
      }
      $('.back-loading-loss-alerts').removeClass('-show');
      this.$widgets.removeClass('-loading');
    },

    _getData: function() {
      var origin = this.status.get('origin');
      var source = this.status.get('source');
      var iso = this.iso;
      var data = {};
      var year = parseInt(moment().format('YYYY'), 10);
      var queryTemplate = API_HOST + QUERIES[origin][source].top;
      var url = new UriTemplate(queryTemplate).fillFromObject({
        widgetsNum: WIDGETS_NUM,
        dataset: DATASETS[origin][source],
        iso: iso,
        year: year
      });
      var promise = $.Deferred();

      $.ajax({ url: url, type: 'GET' })
        .done(function(topResponse) {
          if (topResponse.data.length > 0) {
            CountryService.getRegionsList({ iso: this.iso })
              .then(function(results) {

                topResponse.data.forEach(function(item) {
                  var region = _.findWhere(results, {
                    id_1: item.state_id
                  });
                  var name =  region ? region.name_1 : 'N/A';

                  data[item.state_id] = {
                    alerts: NumbersHelper.addNumberDecimals(item.alerts),
                    data: [],
                    name: name
                  }
                });

                var ids = topResponse.data.map(function(item) {
                  return origin === 'wdpa' ? item.wdpa_id : item.state_id
                }).join('\',\'');

                var url = API_HOST + new UriTemplate(QUERIES[origin][source].data).fillFromObject({
                  dataset: DATASETS[origin][source],
                  iso: iso,
                  year: year,
                  ids: '\'' + ids + '\'',
                });
                $.ajax({ url: url, type: 'GET' })
                  .done(function(dataResponse) {
                    dataResponse.data.forEach(function(item) {
                      if (data[item.state_id] && item.alerts) {
                        data[item.state_id].data.push({
                          date: moment.utc().year(item.year).month(item.month),
                          value: item.alerts
                        })
                      }
                    });
                    promise.resolve(data)
                  });
            }.bind(this))
          } else {
            promise.resolve(false);
          }
        }.bind(this))
        .fail(function(err){
          promise.reject(err);
        });
      return promise;
    }
  });
  return TreeCoverLossView;

});