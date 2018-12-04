
/* -------------------------------- CONSTANTS -------------------------------- **
**
** --------------------------------------------------------------------------- */

var API_ENDPOINT = 'http://localhost:5000/calculate';

var RIM_MATLS = {
  'Alloy': {
    'density': 2700,
    'young_mod': 69e9,
    'shear_mod': 26e9
  },
  'Steel': {
    'density': 8000,
    'young_mod': 200e9,
    'shear_mod': 77e9
  }
}

var SPK_MATLS = {
  'Alloy': {
    'density': 2700,
    'young_mod': 69e9,
  },
  'Steel': {
    'density': 8000,
    'young_mod': 210e9,
  },
  'Titanium': {
    'density': 4500,
    'young_mod': 105e9
  }
}


/* ---------------------------- INITIALIZE GUI ---------------------------- **
**
** ------------------------------------------------------------------------ */

// Update value labels for all range sliders with class .update-range
$('input.update-range').on('change mousemove', function() {
  $(this).prev().html('<strong>' + $(this).val() + '</strong>');
})

// Update value labels for hub width range sliders
$('#hubWidthLeft').on('change mousemove', function() {
  $(('#hubWidthLeft_label')).html('<strong>' + (-parseInt($(this).val())).toString() + '</strong>')

  // If symmetric, update the other one to match
  // TODO

})

$('#hubWidthRight').on('change mousemove', function() {
  $(('#hubWidthRight_label')).html('<strong>' + $(this).val() + '</strong>')

  // If symmetric, update the other one to match
  // TODO

})

// Show or hide the non-drive-side spoke panel
$('#spkNDSSame').click(function() {
  if ($('#spkNDSSame').is(':checked')) {
    $('#spkNDSPanel').collapse('hide')
  } else {
    $('#spkNDSPanel').collapse('show')
  }
})

// Editable table
function initEditableTable() {
  $('#tableForces').editableTableWidget();

  $('.remove-row').click(function() {
    $(this).parent().parent().remove()
  })
}

// Add row callback
$('.add-force').on('click', function() {
  $('#tableForces tr:last').after('<tr><th>' + $(this).text() + '</th><td>0</td><td>0</td><th><a class="remove-row" href="#"><i class="fas fa-trash-alt"></i></a></th></tr>');

  // Re-initialize to add callbacks to new row
  initEditableTable()
})

initEditableTable()


// Work the magic!
$('#btnPressMe').on('click', function() {
  $(this).text('Please wait...')
  $(this).addClass('disabled')
  calc_and_plot_tensions()

})

function reset_calc_button() {
  $('#btnPressMe').text('Calculate')
  $('#btnPressMe').removeClass('disabled')
}


/* ------------------------------- FUNCTIONS ------------------------------ **
**
** ------------------------------------------------------------------------ */

// Build JSON request object to send to wheel-api
function build_json_rim() {

  var rimForm = {}
  var rimJSON = {}

  // Load form data
  $('#formRim').serializeArray().forEach(e => { rimForm[e['name']] = e['value']; })

  // ISO diameter
  rimJSON['radius'] = 0.001*(parseFloat(/\((\d+)\)/g.exec(rimForm['rimSize'])[1])/2 - 5)

  // Material
  rimJSON['density'] = RIM_MATLS[rimForm['rimMatl']]['density']
  rimJSON['young_mod'] = RIM_MATLS[rimForm['rimMatl']]['young_mod']
  rimJSON['shear_mod'] = RIM_MATLS[rimForm['rimMatl']]['shear_mod']

  // Section properties
  rimJSON['section_type'] = 'general'
  rimJSON['section_params'] = {
    'area': 0.001*parseFloat(rimForm['rimMass']) / (rimJSON['density'] * 2*3.1415*rimJSON['radius']),
    'I_rad': parseFloat(rimForm['rimRadStiff']) / rimJSON['young_mod'],
    'I_lat': parseFloat(rimForm['rimLatStiff']) / rimJSON['young_mod'],
    'J_tor': parseFloat(rimForm['rimTorStiff']) / rimJSON['shear_mod'],
    'I_warp': 0.
  }

  return rimJSON
}

function build_json_hub() {

  var form = {}
  var json = {}

  // Load form data
  $('#formHub').serializeArray().forEach(e => { form[e['name']] = e['value']; })

  json['diameter'] = 0.001*parseFloat(form['hubDiameter'])
  json['width_ds'] = 0.001*parseFloat(form['hubWidthRight'])
  json['width_nds'] = -0.001*parseFloat(form['hubWidthLeft'])

  return json
}

function build_json_spokes(form_obj) {

  var form = {}
  var json = {}

  // Load form data
  form_obj.serializeArray().forEach(e => { form[e['name']] = e['value']; })

  // Pattern
  if (form['spkPattern'] == 'Radial') {
    json['num_cross'] = 0
  } else {
    json['num_cross'] = parseInt(form['spkPattern'].substring(0, 1))
  }

  // Material
  json['density'] = SPK_MATLS[form['spkMatl']]['density']
  json['young_mod'] = SPK_MATLS[form['spkMatl']]['young_mod']

  json['diameter'] = 0.001*parseFloat(form['spkDiam'])
  json['offset'] = 0.
  json['tension'] = parseFloat(form['spkTens']) * 9.81  // Newtons (from kgf)

  return json
}

function build_json_wheel() {

  var json = {}

  json['rim'] = build_json_rim()
  json['hub'] = build_json_hub()

  if ($('#spkNDSSame').is(':checked')) {

    spkJSON = build_json_spokes($('#formSpokesDS'))
    spkJSON['num'] = parseInt($('#spkNum').val())

    json['spokes'] = spkJSON

  } else {

    dsJSON = build_json_spokes($('#formSpokesDS'))
    ndsJSON = build_json_spokes($('#formSpokesNDS'))

    dsJSON['num'] = parseInt($('#spkNum').val())/2
    ndsJSON['num'] = parseInt($('#spkNum').val())/2

    json['spokes_ds'] = dsJSON
    json['spokes_nds'] = ndsJSON

  }

  return json
}

function build_json_forces() {

  var dofs = {'Radial': 'f_rad', 'Lateral': 'f_lat', 'Tangential': 'f_tan'}
  var json = []

  $('#tableForces > tbody > tr').not(':first').each(function() {
    dof = $(this).find('th:first').text()
    loc = $(this).find('td:first').text()
    mag = $(this).find('td:last').text()

    f = {'location': parseFloat(loc)*Math.PI/180.}  // Convert [deg] -> [rad]
    f[dofs[dof]] = 9.81*parseFloat(mag)  // Convert [kgf] -> [N]

    json.push(f)
  })

  return json
}

function calc_and_plot_tensions() {

  // Build wheel JSON
  post_data = {
    'wheel': build_json_wheel(),
    'tension': {'forces': build_json_forces()}
  }

  console.log(post_data)

  $.post({
    url: API_ENDPOINT,
    data: JSON.stringify(post_data),
    dataType: 'json',
    contentType: 'application/json',
    success: function (result) {
      plot_tensions(result);
      reset_calc_button();
    },
    error: function (xhr, ajaxOptions, thrownError) {
      // TODO
      reset_calc_button();
    }
  });
}

function plot_tensions(data) {
  console.log(data)

  plot_canvas = document.getElementById('tension-plot');

  theta = data['tension']['spokes'].slice()
  tension = data['tension']['tension'].slice()

  for (var i=0; i<theta.length; i++) {
  	theta[i] *= 360./parseFloat($('#spkNum').val());
  }

  if (true) {  // Separate traces for left and right spokes
    theta_nds = theta.filter((e, i) => {return i%2 === 0})
    T_nds = tension.filter((e, i) => {return i%2 === 0})

    theta_ds = theta.filter((e, i) => {return i%2 === 1})
    T_ds = tension.filter((e, i) => {return i%2 === 1})

    traces = [
      {
        name: 'Non-drive-side spokes',
        r: T_nds.concat(T_nds[0]),
        theta: theta_nds.concat(theta_nds[0]),
        type: 'scatterpolar',
      },
      {
        name: 'Drive-side spokes',
        r: T_ds.concat(T_ds[0]),
        theta: theta_ds.concat(theta_ds[0]),
        type: 'scatterpolar',
      }
    ]
  }

  var layout = {
    margin: {
      l: 50, r: 50, t: 50, b: 50
    },
    legend: {
      orientation: 'h'
    },
    polar: {
      angularaxis: {
        rotation: -90,
        showgrid: true,
        showticklabels: false,
        tickmode: 'linear',
        tick0: 0,
        dtick: 360. / parseInt($('#spkNum').val()),
        ticks: ''
      },
      radialaxis: {
        angle: -90,
        showgrid: false,
        showticklabels: false
      }
    }
  }

  Plotly.newPlot(plot_canvas, traces, layout);
}

calc_and_plot_tensions()
