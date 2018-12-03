
/* -------------------------------- CONSTANTS -------------------------------- **
**
** --------------------------------------------------------------------------- */

var rimMaterials = {
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

var spkMaterials = {
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

var default_wheel = {
  'wheel': {
    'hub': {
      'diameter': 0.05,
      'width_nds': 0.025,
      'width_ds': 0.025},
    'rim': {
      'radius': 0.3,
      'young_mod': 69e9,
      'shear_mod': 26e9,
      'density': 2700.,
      'section_type': 'general',
      'section_params': {
        'area': 100e-6,
        'I_rad': 100 / 69e9,
        'I_lat': 200 / 69e9,
        'J_tor': 25 / 26e9,
        'I_warp': 0.}},
    'spokes': {
      'num': 36,
      'num_cross': 3,
      'diameter': 1.8e-3,
      'young_mod': 210e9,
      'density': 8000.,
      'offset': 0.,
      'tension': 0.}},
}


/* -------------------------------- CALLBACKS -------------------------------- **
**
** --------------------------------------------------------------------------- */

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

initEditableTable()

// Add row callback
$('.add-force').on('click', function() {
  $('#tableForces tr:last').after('<tr><th>' + $(this).text() + '</th><td>0</td><td>0</td><th><a class="remove-row" href="#"><i class="fas fa-trash-alt"></i></a></th></tr>');

  // Re-initialize to add callbacks to new row
  initEditableTable()
})


// Work the magic!
$('#btnPressMe').on('click', function() {

  calc_and_plot_tensions()

})


/* -------------------------------- FUNCTIONS -------------------------------- **
**
** --------------------------------------------------------------------------- */

// Build JSON request object to send to wheel-api
function build_json_rim() {

  var rimForm = {}
  var rimJSON = {}

  // Load form data
  $('#formRim').serializeArray().forEach(e => { rimForm[e['name']] = e['value']; })

  // ISO diameter
  rimJSON['radius'] = 0.001*(parseFloat(/\((\d+)\)/g.exec(rimForm['rimSize'])[1])/2 - 5)

  // Material
  rimJSON['density'] = rimMaterials[rimForm['rimMatl']]['density']
  rimJSON['young_mod'] = rimMaterials[rimForm['rimMatl']]['young_mod']
  rimJSON['shear_mod'] = rimMaterials[rimForm['rimMatl']]['shear_mod']

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
  json['density'] = spkMaterials[form['spkMatl']]['density']
  json['young_mod'] = spkMaterials[form['spkMatl']]['young_mod']

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

    f = {'location': parseFloat(loc)*Math.PI/180.}
    f[dofs[dof]] = 9.81*parseFloat(mag)  // Convert [kgf] -> [N]

    json.push(f)
  })

  return json
}

function calc_and_plot_tensions() {

  // Build wheel JSON
  post_data = {
    'wheel': build_json_wheel()
  }

  // Build JSON from forces table
  post_data['tension'] = {
    'forces': build_json_forces()
  }

  console.log(post_data)

  $.post({
    url: 'http://localhost:5000/calculate',
    data: JSON.stringify(post_data),
    dataType: 'json',
    contentType: 'application/json',
    success: function (result) {
      plot_tensions(result);
    },
    error: function (xhr, ajaxOptions, thrownError) {}
  });
}

function plot_tensions(data) {
  console.log(data)

  plot_canvas = document.getElementById('tension-plot');

  theta = data['tension']['spokes'].slice()

  for(var i=0; i<theta.length; i++) {
  	theta[i] *= 360./parseFloat($('#spkNum').val());
  }

  var trace = {
  	r: data['tension']['tension'].concat([data['tension']['tension'][0]]),
  	theta: theta.concat(theta[0]),
  	line: {color: 'red'},
  	type: 'scatterpolar'
  }

  var layout = {
    margin: {
      l: 50, r: 50, t: 50, b: 50
    },
    polar: {
      angularaxis: {
        rotation: -90,
        showgrid: false,
        showticklabels: false,
        tickmode: 'auto',
        nticks: 36
      },
      radialaxis: {
        angle: -90,
        showgrid: false,
        showticklabels: false
      }
    }
  }

  console.log(trace)
  console.log(layout)

  Plotly.newPlot(plot_canvas, [trace], layout);
}

calc_and_plot_tensions()
