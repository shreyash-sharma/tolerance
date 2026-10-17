#!/bin/sh
# The opening card as is (0-1.6 s), a 0.6 s calm beat, the story 1.6-11.65 s stretched by 1.2 without changing pitch, then a fade; 15 s total.
ffmpeg -loglevel error -y -i music_src.wav -filter_complex "[0]atrim=0:1.6,asetpts=PTS-STARTPTS[a];[0]atrim=1.6:1.62,asetpts=PTS-STARTPTS,apad=whole_dur=0.6[h];[0]atrim=1.6:11.65,asetpts=PTS-STARTPTS,atempo=0.8333[b];[0]atrim=11.65:12.6,asetpts=PTS-STARTPTS[c];[a][h][b][c]concat=n=4:v=0:a=1,apad,atrim=0:15,afade=t=out:st=14.2:d=0.8[o]" -map "[o]" music.wav
