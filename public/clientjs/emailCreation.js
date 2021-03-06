$(document).ready(function() {
  
  var editor = new MediumEditor('.editable', {
    buttons: ['bold', 'italic', 'anchor', 'header1', 'header2', 
    'quote', 'unorderedlist', 'orderedlist'],
    firstHeader:'h1',
    secondHeader:'h2'
  });
  //save the email to the database
  $('#saveColl').click(function() {
    var html = editor.serialize().emailInput.value;
   $.post("/ajax/editEntry",{
       subject: $('#emailTitleInput').val(),
       content: html,
       entry_id: meta("entryId")
    });
   $('#saveCheckContain, #saveColl').addClass('saved');
  });

  $('#saveFromOverlay').click(function() {
    var html = editor.serialize().emailInput.value;
   $.post("/ajax/editEntry",{
       subject: $('#emailTitleInput').val(),
       content: html,
       entry_id: meta("entryId")
    }, function(data) {
      window.location = "/home";
    });
    
  });

  $('#finalDelete').click(function() {
    $.post("ajax/deleteEntry", {entry_id: meta("entryId")});
    window.location = "/home";
  });

  $('#goBack').click(function() {
    if ($('#saveCheckContain').hasClass('saved') || $('#saveCheckContain').hasClass('unedited')) {
      window.location = "/home";
    } else{
      $('#backOverlay').show();
    };
  });
  $('#continueBack').click(function() {
    window.location = "/home";
  });

  
  //can only edit content when the collection is not published
  if(meta("visible") == "true") {
    $('#deleteColl').hide();
    $('#saveColl').hide();
    $('#articleLinkInput').hide();
    editor.deactivate();
  }

  function meta(name) {
    var tag = document.querySelector('meta[name=' + name + ']');
    if (tag != null)
        return tag.content;
    return '';
  }

 //pulls content
 $('#pullContent').click(function(){
   $.post("ajax/scrapeUrl",{
       url: $('#articleLinkInput').val(),
    },function(data,status){
      if(data.content == "invalid url"){
        alert("invalid url");
      }
      else{
        $('#emailInput').html(data.content);
        $.post("/ajax/editEntry",{
           subject: $('#emailTitleInput').val(),
           content: data.content,
           entry_id: meta("entryId")
        });
      }
    });
 });



  //Pete's stuff
  
  $('#emailTitleInput, #emailInput').change(function() {
    $('#saveCheckContain, #saveColl').removeClass('saved unedited');
  });
  $('#emailTitleInput, #emailInput').keydown(function() {
    $('#saveCheckContain, #saveColl').removeClass('saved unedited');
  });
  $('#deleteColl').click(function() {
    $('#deleteOverlay').show();
  });
  $('#cancelDelete, #finalDelete').click(function() {
    $('#deleteOverlay').hide();
  });
  $('#articleLinkInput').on('input', function() {
    if ($(this).val().length == 0) {
      $(this).css('width', '420px');
      $('#pullContent').css('display','none');
    } else {
      $(this).css('width', '390px');
      $('#pullContent').css('display','inline-block');
    }
  });

});