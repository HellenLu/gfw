define([
  'jquery',
  'backbone',
  'underscore',
  'handlebars',
  'uri',
  'core/View',
  'mps',
  'helpers/numbersHelper',
  'common/views/GroupedGraphView',
  'countries/views/widgets/AnnualTreeCoverLossRankingView',
  'text!countries/templates/widgets/annualTreeCoverLoss.handlebars'
], function(
  $,
  Backbone,
  _,
  Handlebars,
  UriTemplate,
  View,
  mps,
  NumbersHelper,
  GroupedGraphView,
  AnnualTreeCoverLossRankingView,
  tpl) {

  'use strict';

  var API = window.gfw.config.GFW_API_HOST_PROD;
  var QUERY_YEARLY = '/query?sql=select sum(area) as value, year as date from {dataset} and iso=\'{iso}\' WHERE year >= {minYear} AND year <= {maxYear} AND thresh >= {threshValue} group by year';
  var QUERY_TOTAL = '/query/?sql=SELECT sum(area) as value FROM {dataset} WHERE iso=\'{iso}\' AND thresh=\'30\' AND year >= {minYear} AND year <= {maxYear} AND thresh >= {threshValue} GROUP BY iso';
  var YEARS_TOTAL = '/query/?sql=SELECT year FROM a9a32dd2-f7e1-402a-ba6f-48020fbf50ea WHERE iso=\'{iso}\' group by year';
  var THRESH_TOTAL = '/query/?sql=SELECT thresh FROM a9a32dd2-f7e1-402a-ba6f-48020fbf50ea WHERE iso=\'{iso}\' GROUP BY thresh';

  // Datasets
  var DATASETS = [
    {
      slug: 'loss',
      name: 'Tree cover loss',
      show: false,
      dataset: 'a9a32dd2-f7e1-402a-ba6f-48020fbf50ea',
      color: '#ff6599'
    },
    {
      slug: 'wdpa',
      name: 'Protected areas',
      show: true,
      dataset: 'ce4f3eb6-8636-4292-a75f-9ce9ef5e8334',
      color: '#2681bf'
    },
    {
      slug: 'ifl',
      name: 'Intact Forest Landscapes',
      show: true,
      dataset: 'e9748561-4361-4267-bb9c-ef678cda0795',
      color: '#2681bf'
    },
    {
      slug: 'biodiversity',
      name: 'Biodiversity hotspots',
      show: true,
      dataset: 'd386d1aa-e710-4b50-92a2-6bbc4f4be19a',
      color: '#2681bf'
    },
    {
      slug: 'high-carbon',
      name: 'High carbon stocks',
      show: false,
      dataset: '',
      color: '#2681bf'
    },
    {
      slug: 'peat',
      name: 'Peat',
      show: true,
      dataset: '949aa256-14cc-4d32-b71f-725c060fdd01',
      color: '#2681bf'
    },
    {
      slug: 'moratorium-areas',
      name: 'Moratorium areas',
      show: true,
      dataset: '7f8b8d9e-7f38-4089-9f58-5c38351e6ff2',
      color: '#2681bf'
    },
    {
      slug: 'primary-forests',
      name: 'Primary forests',
      show: true,
      dataset: 'ac5a509a-e9a9-4880-8107-7699dae9fdfe',
      color: '#2681bf'
    },
    {
      slug: 'indigenous-community-forests',
      name: 'Indigenous and community forests',
      show: true,
      dataset: '7f8b8d9e-7f38-4089-9f58-5c38351e6ff2',
      color: '#2681bf'
    }
  ];

  var AnnualTreeCoverLossView = View.extend({
    el: '#widget-annual-tree-cover-loss',

    events: {
      'click .js-dataset': '_updateChart',
      'change #annual-tree-cover-loss-start-year': '_checkDates',
      'change #annual-tree-cover-loss-end-year': '_checkDates',
      'change #annual-tree-cover-loss-thresh': '_checkThresh',
    },

    status: new (Backbone.Model.extend({
      defaults: {
        years: null,
        minYear: null,
        maxYear: null,
        thresh: null,
        threshValue: 30,
        region: 0
      }
    })),

    _subscriptions:[
      {
        'Regions/update': function(value) {
          this.status.set('region', parseInt(value));
          this._getList()
          .done(this._initWidget.bind(this));
        }
      },
    ],

    defaults: {
      currentDatasets: ['loss', 'wdpa']
    },

    template: Handlebars.compile(tpl),

    initialize: function(params) {
      View.prototype.initialize.apply(this);
      this.iso = params.iso;
      this.currentDatasets = this.defaults.currentDatasets;
      this.datasets = [];
      this._getDates()
        .done(function() {
          this._getList();
        }.bind(this))
        .done(function() {
          this._getThresh();
        }.bind(this))
        .done(function() {
          this._initWidget();
        }.bind(this));
    },

    render: function() {
      this.$el.html(this.template({
        totalCoverLoss: this._getTotalCoverLoss(),
        datasets: this._getAvailableDatasets(),
        years: this.status.get('years'),
        minYear: this.status.get('minYear'),
        maxYear: this.status.get('maxYear'),
        thresh: this.status.get('thresh'),
      }));
      $('.back-loading').removeClass('-show');
      this.$el.removeClass('-loading');
    },

    _getDates: function() {
      var $deferred = $.Deferred();
      var datesList = [];

      var url = API + new UriTemplate(YEARS_TOTAL).fillFromObject({
        iso: this.iso
      });

      $.ajax({
        url: url,
        type: 'GET'
      })
      .done(function(res) {
        for (var i = 0; i < res.data.length; i++) {
          datesList[i] = {
            year: res.data[i].year,
            enable: true,
          }

          if (i === 0) {
            datesList[i].selectedMin = true;
          } else if (i === res.data.length - 1) {
            datesList[i].selectedMax = true;
          }
        }
        this.status.set('years', datesList);
        this.status.set('minYear', res.data[0].year);
        this.status.set('maxYear', res.data[res.data.length - 1].year);

        return $deferred.resolve();
      }.bind(this))
      .fail(function(error) {
        return $deferred.reject();
      });
      return $deferred;
    },

    _getThresh: function() {
      var $deferred = $.Deferred();
      var threshList = [];

      var url = API + new UriTemplate(THRESH_TOTAL).fillFromObject({
        iso: this.iso
      });

      $.ajax({
        url: url,
        type: 'GET'
      })
      .done(function(res) {
        for (var i = 0; i < res.data.length; i++) {
          threshList[i] = {
            value: res.data[i].thresh,
            selected: (res.data[i].thresh === 30)
          }
        }
        this.status.set('thresh', threshList);
        return $deferred.resolve();
      }.bind(this))
        .fail(function(error) {
          return $deferred.reject();
        });
      return $deferred;
    },

    _getList: function() {
      var $deferred = $.Deferred();
      var $promises = [];

      _.each(DATASETS, function(item) {
        if (item.dataset) {
          var url = API + new UriTemplate(QUERY_TOTAL).fillFromObject({
            dataset: item.dataset,
            iso: this.iso,
            minYear: this.status.get('minYear'),
            maxYear: this.status.get('maxYear'),
            threshValue: this.status.get('threshValue'),
            region: this.status.get('region'),
          });
          $promises.push(this._getTotalData(url, item.slug));
        }
      }.bind(this));

      $.when.apply($, $promises).then(function(schemas) {
        return $deferred.resolve();
      }.bind(this));

      return $deferred;
    },

    _getTotalData: function(url, slug) {
      var $deferred = $.Deferred();

      $.ajax({
        url: url,
        type: 'GET'
      })
      .done(function(res) {
        if (res.data && res.data.length > 0) {
          var value = res.data[0] && res.data[0].value ? res.data[0].value : null;

          this.datasets.push({
            slug: slug,
            value: NumbersHelper.addNumberDecimals(Math.round(value)) || ''
          });
        }
        return $deferred.resolve();
      }.bind(this))
      .fail(function(error) {
        return $deferred.reject();
      });
      return $deferred;
    },

    _getTotalCoverLoss: function() {
      var dataset = _.findWhere(this.datasets, { slug: 'loss'});
      var totalValue = 'N/A';

      if (dataset) {
        totalValue = dataset.value;
      }
      return totalValue;
    },

    _getAvailableDatasets: function() {
      var allDatasets = _.where(DATASETS, { show: true });
      var datasets = [];
      var totalValue = parseFloat(this._getTotalCoverLoss().replace(',',''));
      if(allDatasets) {
        _.each(allDatasets, function(dataset) {
          var datasetData = _.extend({}, dataset);
          var data = _.findWhere(this.datasets, { slug: datasetData.slug });
          var value = data && data.value ? data.value : null;

          if (value) {
            datasetData.value = value;
            datasetData.percentage = ((parseFloat(value) / totalValue) * 100).toFixed(2);
            datasets.push(datasetData);
          }
        }.bind(this));
      }
      return datasets;
    },

    _getGraphData: function() {
      var $deferred = $.Deferred();
      var $promises = [];
      var data = [];

      _.each(this.currentDatasets, function(item) {
        var current = _.findWhere(DATASETS, { slug: item });

        if (current.dataset) {
          var url = API + new UriTemplate(QUERY_YEARLY).fillFromObject({
            dataset: current.dataset,
            iso: this.iso,
            minYear: this.status.get('minYear'),
            maxYear: this.status.get('maxYear'),
            threshValue: this.status.get('threshValue'),
            region: this.status.get('region'),
          });

          $promises.push(
            $.ajax({
              url: url,
              type: 'GET'
            })
            .done(function(res) {
              data.push({
                data: res.data,
                slug: item
              });
            })
          );
        }
      }.bind(this));

      $.when.apply($, $promises).then(function(schemas) {
        return $deferred.resolve(data);
      }.bind(this));

      return $deferred;
    },

    _initWidget: function() {
      this._getGraphData().done(function(data) {
        this._setData(data);
        this.render();
        this._renderGraph();
        this.annualRanking = new AnnualTreeCoverLossRankingView({
          iso: this.iso
        });
      }.bind(this));
    },

    _setData: function(data) {
      this.data = [];
      _.each(data, function(item) {
        _.each(item.data, function(elem) {
          var year = elem.date.toString();
          var current = _.findWhere(this.data, { label: year });
          if (!current) {
            var indicator = {
              label: year
            };
            indicator[item.slug] = elem.value;
            this.data.push(indicator);
          } else {
            current[item.slug] = elem.value;
          }
        }.bind(this));
      }.bind(this));
    },

    _getBucket: function() {
      var buckets = [];
      var selectedDatsets = _.reject(DATASETS, function(item){
        return this.currentDatasets.indexOf(item.slug) === -1;
      }.bind(this));

      selectedDatsets.forEach(function(dataset) {
        buckets[dataset.slug] = dataset.color;
      });

      return buckets;
    },

    _renderGraph: function() {
      this.lineGraph = new GroupedGraphView({
        el: '#annual-tree-cover-loss-graph',
        data: this.data,
        bucket: this._getBucket(),
        defaultIndicator: this.currentDatasets[0]
      });
    },

    _updateChart: function(ev) {
      var slug = $(ev.currentTarget).data('slug');
      this.currentDatasets.pop();
      this.currentDatasets.push(slug);

      this._getGraphData().done(function(data) {
        this._setData(data);
        this.lineGraph.updateChart({
          data: this.data,
          bucket: this._getBucket()
        });
      }.bind(this));
    },

    _changeDates: function(value) {
      var datesList = [];

      for (var i = 0; i < this.status.get('years').length; i++) {
        datesList[i] = {
          year: this.status.get('years')[i].year,
          enable: this.status.get('years')[i].year >= this.status.get('minYear'),
        }

        if (this.status.get('years')[i].year === this.status.get('minYear')) {
          datesList[i].selectedMin = true;
        } else if (this.status.get('years')[i].year === this.status.get('maxYear')) {
          datesList[i].selectedMax = true;
        }
      }

      this.status.set('years', datesList);
    },

    _checkDates: function(e) {
      $('.back-loading').addClass('-show');
      this.$el.addClass('-loading');
      var idTarget = e.currentTarget.id;
      var value = parseInt(e.currentTarget.value);

      if (idTarget === 'annual-tree-cover-loss-start-year') {
        this.status.set('minYear', value);
        this._changeDates(value);
      }

      if (idTarget === 'annual-tree-cover-loss-end-year') {
        this.status.set('maxYear', value);
        this._changeDates(value);
      }

      this._getList()
      .done(this._initWidget.bind(this));
    },

    _checkThresh: function(e) {
      $('.back-loading').addClass('-show');
      this.$el.addClass('-loading');
      var threshList = [];
      var value = parseInt(e.currentTarget.value);
      this.status.set('threshValue', value);
      for (var i = 0; i < this.status.get('thresh').length; i++) {
        threshList[i] = {
          value: this.status.get('thresh')[i].value,
          selected: this.status.get('threshValue') === this.status.get('thresh')[i].value
        }
      }
      this.status.set('thresh', threshList);
      this._getList()
      .done(this._initWidget.bind(this));
    }
  });
  return AnnualTreeCoverLossView;

});