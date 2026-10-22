## Question 11. Number Of Movies Per Genre
Design Document
_design/actors

Index name
byActors

function (doc) {
  if ('docs' in doc) {
    doc.docs.forEach(function(movie) {
      if (movie.genres) {
        movie.genres.forEach(function (genre) {
          emit(genre, 1);
        });
      }
    });
  }
}
