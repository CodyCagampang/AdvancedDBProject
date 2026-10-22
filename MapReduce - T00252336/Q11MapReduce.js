## Question 11. Number Of Movies Per Genre
Design Document
_design/actors

Index name
byActors

function(doc) {
  if ('docs' in doc) {
    doc.docs.forEach(function(movies) {
      if (
        movies.actors.indexOf('Tom Hanks') !== -1 &&
        movies.actors.indexOf('Gary Sinise') !== -1
      ) {
        emit(movies._id, movies.title);
      }
    });
  }
}