// Generated by CoffeeScript 1.6.1
var __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

define(['jquery', 'vendor/underscore', 'vendor/backbone-min', 'vendor/forms/backbone-forms.min', 'raw_view', 'map_view', 'chart_view'], function($, _, Backbone, Forms, RawView, MapView, ChartView) {
  var DataCollection, DataModel, DataView, FormModel;
  DataModel = (function(_super) {

    __extends(DataModel, _super);

    function DataModel() {
      return DataModel.__super__.constructor.apply(this, arguments);
    }

    DataModel.prototype.defaults = {
      data: []
    };

    return DataModel;

  })(Backbone.Model);
  FormModel = (function(_super) {

    __extends(FormModel, _super);

    function FormModel() {
      return FormModel.__super__.constructor.apply(this, arguments);
    }

    FormModel.prototype.initialize = function() {
      this.form_id = $('#form_id').html();
      this.user = $('#user').html();
      return this.url = "/api/v1/repos/" + this.form_id + "/?format=json&user=" + this.user;
    };

    return FormModel;

  })(Backbone.Model);
  DataCollection = (function(_super) {

    __extends(DataCollection, _super);

    function DataCollection() {
      return DataCollection.__super__.constructor.apply(this, arguments);
    }

    DataCollection.prototype.model = DataModel;

    DataCollection.prototype.initialize = function() {
      this.form_id = $('#form_id').html();
      return this.url = "/api/v1/data/" + this.form_id + "/?format=json";
    };

    DataCollection.prototype.comparator = function(data) {
      return data.get('timestamp');
    };

    return DataCollection;

  })(Backbone.Collection);
  DataView = (function(_super) {

    __extends(DataView, _super);

    function DataView() {
      return DataView.__super__.constructor.apply(this, arguments);
    }

    DataView.prototype.el = $('#viz');

    DataView.prototype.events = {
      "click #viz_options a": "switch_viz",
      "change #sharing_toggle": "toggle_public"
    };

    DataView.prototype.data = new DataCollection();

    DataView.prototype.form = new FormModel();

    DataView.prototype.subviews = [];

    DataView.prototype.map_headers = null;

    DataView.prototype.map_enabled = false;

    DataView.prototype.map = null;

    DataView.prototype.yaxis = null;

    DataView.prototype.chart_fields = [];

    DataView.prototype.width = 750;

    DataView.prototype.height = 250;

    DataView.prototype.initialize = function() {
      this.listenTo(this.form, 'sync', this.render);
      this.form.fetch();
      this.data = new DataCollection();
      this.data.reset(document.initial_data);
      return this;
    };

    DataView.prototype.add_subview = function(View) {
      var options, subview;
      options = {
        parent: this,
        data: this.data,
        form: this.form
      };
      subview = new View(options);
      this.subviews.push(subview);
      return subview;
    };

    DataView.prototype.toggle_public = function(event) {
      var _this = this;
      console.log('called');
      $.post("/repo/share/" + this.form.form_id + "/", {}, function(response) {
        if (response.success) {
          $(event.currentTarget).attr('checked', response["public"]);
          if (response["public"]) {
            return $('#privacy > div').html('<i class=\'icon-unlock\'></i>&nbsp;PUBLIC');
          } else {
            return $('#privacy > div').html('<i class=\'icon-lock\'></i>&nbsp;PRIVATE');
          }
        }
      });
      return this;
    };

    DataView.prototype.switch_viz = function(event) {
      var viz_type;
      viz_type = $(event.currentTarget).data('type');
      if (viz_type === 'map' && !this.map_enabled) {
        return;
      }
      $('li.active').removeClass('active');
      $(event.currentTarget.parentNode).addClass('active');
      return $('.viz-active').fadeOut('fast', function() {
        var _this = this;
        $(this).removeClass('viz-active');
        return $('#' + viz_type + '_viz').fadeIn('fast', function() {
          if (viz_type === 'map') {
            return document.vizApp.map_view.map.invalidateSize(false);
          }
        }).addClass('viz-active');
      });
    };

    DataView.prototype._detect_types = function(root) {
      var field, _i, _len, _ref, _ref1, _results;
      _results = [];
      for (_i = 0, _len = root.length; _i < _len; _i++) {
        field = root[_i];
        if ((_ref = field.type) === 'group') {
          this._detect_types(field.children);
        }
        if ((_ref1 = field.type) === 'geopoint') {
          $('#map_btn').removeClass('disabled');
          this.map_enabled = true;
          _results.push(this.map_headers = field.name);
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    };

    DataView.prototype.render = function() {
      if (!this.form.attributes.children || !this.data) {
        return;
      }
      this._detect_types(this.form.attributes.children);
      if (this.raw_view === void 0) {
        this.raw_view = this.add_subview(RawView);
      }
      if (this.chart_view === void 0) {
        this.chart_view = this.add_subview(ChartView);
      }
      if (this.map_view === void 0) {
        this.map_view = new MapView({
          parent: this,
          map_headers: this.map_headers,
          data: this.data
        });
        this.subviews.push(this.chart_view);
      }
      if (this.data.models.length > 0) {
        if (this.map_enabled) {
          this.map_view.render();
        } else {
          $('#map').hide();
        }
      } else {
        $('#map_btn').addClass('disabled');
      }
      return this;
    };

    return DataView;

  })(Backbone.View);
  return DataView;
});
